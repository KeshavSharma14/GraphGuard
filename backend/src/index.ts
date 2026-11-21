import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { PrismaClient, User } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "graphguard-development-secret";
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

app.use(cors({ origin: process.env.CORS_ORIGIN || "*", credentials: false }));
app.use(express.json({ limit: "10mb" }));

type AuthedRequest = Request & { user?: User };

function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    void prisma.user.findUnique({ where: { id: payload.sub } }).then((user) => {
      if (!user) return res.status(401).json({ error: "Invalid session" });
      req.user = user;
      next();
    }).catch(next);
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function audit(userId: string | undefined, action: string, details: string, accountId?: string) {
  await prisma.auditLog.create({ data: { userId, action, details, accountId } });
}

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
    }).parse(req.body);
    const password = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({ data: { name: body.name, email: body.email, password } });
    await audit(user.id, "LOGIN", `Analyst ${body.email} registered`);
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "12h" });
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().email(),
      password: z.string(),
    }).parse(req.body);
    let user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user && body.email === "demo@graphguard.ai" && body.password === "demo") {
      user = await prisma.user.create({
        data: {
          name: "Demo Analyst",
          email: "demo@graphguard.ai",
          password: await bcrypt.hash("demo", 10),
        },
      });
    }
    if (!user || !(await bcrypt.compare(body.password, user.password))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    await audit(user.id, "LOGIN", `Analyst ${user.email} logged in`);
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "12h" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/seed", auth, async (req: AuthedRequest, res, next) => {
  try {
    let dataset: any;
    try {
      const response = await fetch(`${ML_SERVICE_URL}/dataset`);
      if (!response.ok) throw new Error(`ML service returned ${response.status}`);
      dataset = await response.json();
    } catch (error) {
      return res.status(503).json({
        error: "ML service unavailable",
        details: error instanceof Error ? error.message : "Unknown ML service error",
      });
    }

    await prisma.transaction.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.account.deleteMany();

    await prisma.account.createMany({
      data: dataset.accounts.map((account: any) => ({
        id: account.id,
        label: account.label,
        metadata: account.metadata,
        riskScore: account.risk_score,
        fraudRingId: account.fraud_ring_id,
        reasonData: account.reasons,
      })),
      skipDuplicates: true,
    });

    await prisma.transaction.createMany({
      data: dataset.transactions.map((tx: any) => ({
        id: `tx-${tx.from}-${tx.to}-${Math.abs(tx.timestamp)}-${tx.amount}`,
        fromAccountId: tx.from,
        toAccountId: tx.to,
        amount: tx.amount,
        timestamp: new Date(tx.timestamp * 1000),
        device: tx.device,
        ipAddress: tx.ipAddress,
      })),
      skipDuplicates: true,
    });

    await audit(req.user!.id, "RISK_RE_EVALUATION", `Re-evaluated ${dataset.accounts.length} accounts`);
    await audit(req.user!.id, "SEED", `Generated ${dataset.transactions.length} synthetic transactions`);

    res.status(201).json({
      accounts: dataset.accounts.length,
      transactions: dataset.transactions.length,
      fraudRings: dataset.fraud_rings.length,
      metrics: dataset.metrics,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/graph", auth, async (_req, res, next) => {
  try {
    const [accounts, transactions] = await Promise.all([
      prisma.account.findMany({ orderBy: { riskScore: "desc" } }),
      prisma.transaction.findMany({
        take: 1500,
        include: { fromAccount: true, toAccount: true },
      }),
    ]);
    const fraudRings = await prisma.account.groupBy({
      by: ["fraudRingId"],
      where: { fraudRingId: { not: null } },
      _count: { _all: true },
    });
    res.json({
      nodes: accounts.map((a) => ({
        id: a.id,
        label: a.label,
        riskScore: a.riskScore,
        flagged: a.flagged,
        fraudRingId: a.fraudRingId,
        reasons: a.reasonData,
        metadata: a.metadata,
      })),
      edges: transactions.map((tx) => ({
        id: tx.id,
        source: tx.fromAccountId,
        target: tx.toAccountId,
        amount: tx.amount,
        timestamp: tx.timestamp,
        device: tx.device,
        ipAddress: tx.ipAddress,
      })),
      fraudRings: fraudRings
        .filter((ring) => ring.fraudRingId)
        .map((ring) => ({ id: ring.fraudRingId, accountCount: ring._count._all })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/accounts/:id/flag", auth, async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({ flagged: z.boolean() }).parse(req.body);
    const accountId = String(req.params.id);
    const account = await prisma.account.update({
      where: { id: accountId },
      data: { flagged: body.flagged },
    });
    await audit(
      req.user!.id,
      body.flagged ? "ACCOUNT_FLAGGED" : "ACCOUNT_CLEARED",
      `${body.flagged ? "Flagged" : "Cleared"} account ${account.id}`,
      account.id,
    );
    res.json(account);
  } catch (error) {
    next(error);
  }
});

app.get("/api/audit-logs", auth, async (_req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } }, account: { select: { id: true } } },
    });
    res.json(logs);
  } catch (error) {
    next(error);
  }
});

app.get("/api/metrics", auth, async (_req, res, next) => {
  try {
    const mlResponse = await fetch(`${ML_SERVICE_URL}/metrics`);
    if (!mlResponse.ok) throw new Error(`ML service returned ${mlResponse.status}`);
    const mlMetrics = await mlResponse.json();
    const fraudRingCount = await prisma.account.groupBy({
      by: ["fraudRingId"],
      where: { fraudRingId: { not: null } },
    }).then((rows) => rows.length);
    res.json({ ...mlMetrics, fraud_rings: fraudRingCount });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: "Validation error", details: error.errors });
  }
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`GraphGuard backend listening on port ${PORT}`);
});
