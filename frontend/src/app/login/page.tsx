"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LogIn, AlertCircle } from "lucide-react";
import { clsx } from "clsx";
import { useAuth } from "@/hooks/useAuth";
import AuthShell from "@/components/auth/AuthShell";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await login(username, password);
    setBusy(false);
    if (result.ok) {
      router.push(params.get("redirect") ?? "/control");
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4"
      >
        <div className="flex items-center gap-2 mb-2">
          <LogIn size={18} className="text-brand-green" />
          <h1 className="text-xl font-semibold text-slate-100">Sign In</h1>
        </div>
        <p className="text-sm text-slate-500 -mt-2">
          Manage setpoints and alert thresholds for your farm.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs text-slate-400">Username</label>
          <input
            type="text" autoFocus value={username} required
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-surface-hover border border-surface-bright text-slate-200 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-green/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-slate-400">Password</label>
          <input
            type="password" value={password} required
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-surface-hover border border-surface-bright text-slate-200 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-green/50"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            <AlertCircle size={13} className="shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className={clsx(
            "w-full py-2.5 rounded-lg text-sm font-medium transition-all",
            "bg-brand-green text-black hover:bg-brand-green/90 disabled:opacity-50",
          )}
        >
          {busy ? "Signing in…" : "Sign In"}
        </button>

        <p className="text-center text-xs text-slate-500">
          New here?{" "}
          <Link href="/register" className="text-brand-green hover:underline">
            Create an account
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
