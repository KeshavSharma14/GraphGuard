"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";
import { ShieldCheck, LoaderCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(demo = false) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: demo ? "demo@graphguard.ai" : email,
          password: demo ? "demo" : password,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed");
      localStorage.setItem("graphguard_token", data.token);
      localStorage.setItem("graphguard_user", JSON.stringify(data.user));
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,#17213a_0,#080d1a_55%)] px-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-700/70 bg-[#0d1424]/95 p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">GraphGuard</h1>
          <p className="mt-2 text-sm text-slate-400">Fraud intelligence console</p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void login();
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-300">Email</label>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="analyst@company.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm outline-none focus:border-cyan-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-300">Password</label>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm outline-none focus:border-cyan-400"
            />
          </div>
          {error && <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-cyan-400 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
          <div className="h-px flex-1 bg-slate-800" />
          OR
          <div className="h-px flex-1 bg-slate-800" />
        </div>
        <button
          type="button"
          onClick={() => void login(true)}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/5 py-2.5 text-sm font-semibold text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-60"
        >
          {loading ? <LoaderCircle className="animate-spin" size={16} /> : null}
          Demo Analyst Login
        </button>
      </section>
    </main>
  );
}
