"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FraudGraph, { GraphNode, GraphEdge } from "@/components/FraudGraph";
import { API_URL, authHeaders } from "@/lib/api";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Flag,
  LogOut,
  RefreshCcw,
  Search,
  Shield,
  X,
} from "lucide-react";

type Metrics = {
  precision: number;
  recall: number;
  f1: number;
  latency_ms: number;
  fraud_rings: number;
  detected_fraud_rings?: number;
};

type AuditLog = {
  id: string;
  action: string;
  details: string;
  createdAt: string;
  user?: { name: string; email: string } | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [fraudRingIds, setFraudRingIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"graph" | "logs">("graph");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("graphguard_token");
    if (!stored) {
      router.replace("/");
      return;
    }
    setToken(stored);
  }, [router]);

  async function refresh(activeToken: string) {
    setLoading(true);
    const headers = authHeaders(activeToken);
    try {
      const [graphResponse, metricsResponse, logsResponse] = await Promise.all([
        fetch(`${API_URL}/api/graph`, { headers }),
        fetch(`${API_URL}/api/metrics`, { headers }),
        fetch(`${API_URL}/api/audit-logs`, { headers }),
      ]);
      if ([graphResponse, metricsResponse, logsResponse].some((response) => response.status === 401)) {
        localStorage.removeItem("graphguard_token");
        router.replace("/");
        return;
      }
      const graph = await graphResponse.json();
      setNodes(graph.nodes || []);
      setEdges(graph.edges || []);
      setFraudRingIds((graph.fraudRings || []).map((ring: { id: string }) => ring.id));
      setMetrics(await metricsResponse.json());
      setLogs(await logsResponse.json());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    void (async () => {
      if (await ensureSeeded(token)) await refresh(token);
    })();
  }, [token]);

  async function ensureSeeded(activeToken: string) {
    const headers = authHeaders(activeToken);
    const graphResponse = await fetch(`${API_URL}/api/graph`, { headers });
    if (!graphResponse.ok) return false;
    const graph = await graphResponse.json();
    if (graph.nodes?.length) return true;
    const seedResponse = await fetch(`${API_URL}/api/seed`, { method: "POST", headers });
    if (!seedResponse.ok) {
      console.error(await seedResponse.text());
      return false;
    }
    return true;
  }

  async function flagSelected(flagged: boolean) {
    if (!selected) return;
    const response = await fetch(`${API_URL}/api/accounts/${selected.id}/flag`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ flagged }),
    });
    if (!response.ok) return;
    await refresh(token);
    setSelected((current) => current ? { ...current, flagged } : current);
  }

  const filteredNodes = useMemo(
    () => search ? nodes.filter((node) => node.id.toLowerCase().includes(search.toLowerCase())) : nodes,
    [nodes, search],
  );

  const transactions = useMemo(
    () => selected
      ? edges.filter((edge) => edge.source === selected.id || edge.target === selected.id).slice(0, 12)
      : [],
    [edges, selected],
  );

  const ringSet = useMemo(() => new Set(fraudRingIds), [fraudRingIds]);
  const riskCount = nodes.filter((node) => node.riskScore >= 65).length;

  return (
    <main className="min-h-screen bg-[#080d1a] text-slate-100">
      <header className="flex h-16 items-center justify-between border-b border-slate-800 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
            <Shield size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold">GraphGuard</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Fraud Intelligence</p>
          </div>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem("graphguard_token");
            router.replace("/");
          }}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800"
        >
          <LogOut size={16} /> Logout
        </button>
      </header>

      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
        {[
          { label: "Detected Fraud Rings", value: metrics?.detected_fraud_rings || metrics?.fraud_rings || fraudRingIds.length, icon: AlertTriangle, color: "text-red-400" },
          { label: "Model Precision", value: `${((metrics?.precision || 0) * 100).toFixed(1)}%`, icon: BarChart3, color: "text-cyan-300" },
          { label: "Model Recall", value: `${((metrics?.recall || 0) * 100).toFixed(1)}%`, icon: Activity, color: "text-violet-300" },
          { label: "Avg ML/API Latency", value: `${(metrics?.latency_ms || 0).toFixed(1)} ms`, icon: RefreshCcw, color: "text-amber-300" },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-800 bg-[#0d1424] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">{card.label}</p>
              <card.icon size={16} className={card.color} />
            </div>
            <p className="mt-2 text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="px-4 pb-4">
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0d1424]">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div className="flex items-center gap-1">
              <button onClick={() => setTab("graph")} className={`rounded-md px-3 py-1.5 text-sm ${tab === "graph" ? "bg-slate-800 text-white" : "text-slate-400"}`}>
                Fraud Graph
              </button>
              <button onClick={() => setTab("logs")} className={`rounded-md px-3 py-1.5 text-sm ${tab === "logs" ? "bg-slate-800 text-white" : "text-slate-400"}`}>
                Audit Logs
              </button>
            </div>
            {tab === "graph" && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />Low
                  <span className="ml-2 h-2 w-2 rounded-full bg-amber-400" />Medium
                  <span className="ml-2 h-2 w-2 rounded-full bg-red-400" />High
                </div>
                <div className="flex items-center rounded-lg border border-slate-700 bg-slate-950/40 px-2">
                  <Search size={14} className="text-slate-500" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Account ID"
                    className="w-28 bg-transparent px-2 py-1.5 text-xs outline-none"
                  />
                </div>
                <button onClick={() => void refresh(token)} className="rounded-md border border-slate-700 p-2 text-slate-400 hover:text-white" title="Refresh">
                  <RefreshCcw size={14} />
                </button>
              </div>
            )}
          </div>

          {tab === "graph" ? (
            <div className="relative h-[560px]">
              {loading ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b1020] text-sm text-slate-400">Loading intelligence graph...</div>
              ) : (
                <FraudGraph nodes={filteredNodes} edges={edges} ringIds={ringSet} onSelect={setSelected} />
              )}
              {selected && (
                <aside className="absolute right-0 top-0 h-full w-[340px] overflow-y-auto border-l border-slate-700 bg-[#101729]/95 p-5 shadow-2xl backdrop-blur">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">Account</p>
                      <h2 className="mt-1 font-bold">{selected.id}</h2>
                    </div>
                    <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white"><X size={18} /></button>
                  </div>

                  <div className="mt-5 rounded-xl border border-slate-700 p-4">
                    <div className="flex items-end justify-between">
                      <span className="text-sm text-slate-400">Risk score</span>
                      <span className={`text-3xl font-bold ${selected.riskScore >= 65 ? "text-red-400" : selected.riskScore >= 35 ? "text-amber-400" : "text-emerald-400"}`}>
                        {selected.riskScore}
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-400" style={{ width: `${selected.riskScore}%` }} />
                    </div>
                  </div>

                  <div className="mt-5">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Explainable breakdown</h3>
                    <div className="space-y-2">
                      {(selected.reasons || []).map((reason) => (
                        <div key={reason} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
                          {reason}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Recent transactions</h3>
                    <div className="space-y-1">
                      {transactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between rounded-md border border-slate-800 px-3 py-2 text-xs">
                          <span className="text-slate-500">{tx.source === selected.id ? "Sent" : "Received"}</span>
                          <span>${tx.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => void flagSelected(!selected.flagged)}
                    className={`mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold ${
                      selected.flagged ? "border border-slate-600 text-slate-300" : "bg-red-500 text-white hover:bg-red-400"
                    }`}
                  >
                    <Flag size={15} /> {selected.flagged ? "Clear Account" : "Flag Account"}
                  </button>
                </aside>
              )}
            </div>
          ) : (
            <div className="h-[560px] overflow-y-auto p-4">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr><th className="pb-3">Time</th><th className="pb-3">Action</th><th className="pb-3">Details</th><th className="pb-3">Analyst</th></tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t border-slate-800">
                      <td className="py-3 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="py-3"><span className="rounded bg-slate-800 px-2 py-1 text-xs">{log.action}</span></td>
                      <td className="py-3 text-slate-300">{log.details}</td>
                      <td className="py-3 text-slate-400">{log.user?.name || "System"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
