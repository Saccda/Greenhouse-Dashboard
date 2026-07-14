"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus, AlertCircle } from "lucide-react";
import { clsx } from "clsx";
import { useAuth } from "@/hooks/useAuth";
import AuthShell from "@/components/auth/AuthShell";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [username, setUsername]       = useState("");
  const [password, setPassword]       = useState("");
  const [email, setEmail]             = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError]             = useState<string | null>(null);
  const [busy, setBusy]               = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await register({ username, password, email, displayName });
    setBusy(false);
    if (result.ok) {
      router.push("/control");
    } else {
      setError(result.error);
    }
  };

  return (
    <AuthShell>
      <div className="flex-1 flex items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <UserPlus size={18} className="text-brand-green" />
            <h1 className="text-xl font-semibold text-slate-100">Create Account</h1>
          </div>
          <p className="text-sm text-slate-500 -mt-2">
            New accounts start with view-only access — a farm owner needs to approve you
            before you can send setpoints or save thresholds.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">Display name</label>
            <input
              type="text" autoFocus value={displayName} required maxLength={64}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-surface-hover border border-surface-bright text-slate-200 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-green/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">Email</label>
            <input
              type="email" value={email} required
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface-hover border border-surface-bright text-slate-200 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-green/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">Username</label>
            <input
              type="text" value={username} required minLength={3} maxLength={64}
              pattern="[a-zA-Z0-9_.\-]+"
              title="Letters, numbers, dots, underscores, or hyphens only"
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-surface-hover border border-surface-bright text-slate-200 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-green/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">Password</label>
            <input
              type="password" value={password} required minLength={8}
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
            {busy ? "Creating account…" : "Create Account"}
          </button>

          <p className="text-center text-xs text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="text-brand-green hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
