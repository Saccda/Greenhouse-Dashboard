"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, User, Mail, AtSign, Lock } from "lucide-react";
import { clsx } from "clsx";
import { useAuth } from "@/hooks/useAuth";
import AuthShell from "@/components/auth/AuthShell";
import { AuthInput, AuthPasswordInput, ModeToggle } from "@/components/auth/AuthInputs";

type Mode = "signin" | "signup";

function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "signin");
  useEffect(() => {
    setMode(params.get("mode") === "signup" ? "signup" : "signin");
  }, [params]);

  const changeMode = (m: Mode) => {
    setMode(m);
    const next = new URLSearchParams(params.toString());
    if (m === "signup") next.set("mode", "signup"); else next.delete("mode");
    router.replace(`/login${next.toString() ? `?${next}` : ""}`, { scroll: false });
  };

  const [username, setUsername]       = useState("");
  const [password, setPassword]       = useState("");
  const [email, setEmail]             = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError]             = useState<string | null>(null);
  const [busy, setBusy]               = useState(false);

  const redirectTo = () => router.push(params.get("redirect") ?? "/control");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = mode === "signin"
      ? await login(username, password)
      : await register({ username, password, email, displayName });
    setBusy(false);
    if (result.ok) redirectTo();
    else setError(result.error);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto space-y-7">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100 tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create account"}
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          {mode === "signin"
            ? "Manage setpoints and alert thresholds for your farm."
            : "New accounts start view-only until a farm owner approves you."}
        </p>
      </div>

      <ModeToggle mode={mode} onChange={changeMode} />

        {mode === "signup" && (
          <>
            <AuthInput
              icon={User} type="text" placeholder="Display name" autoFocus required maxLength={64}
              value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            />
            <AuthInput
              icon={Mail} type="email" placeholder="Email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </>
        )}

        <AuthInput
          icon={AtSign} type="text" placeholder="Username" required
          autoFocus={mode === "signin"}
          minLength={mode === "signup" ? 3 : undefined}
          maxLength={64}
          pattern={mode === "signup" ? "[a-zA-Z0-9_.\\-]+" : undefined}
          title={mode === "signup" ? "Letters, numbers, dots, underscores, or hyphens only" : undefined}
          value={username} onChange={(e) => setUsername(e.target.value)}
        />

        <AuthPasswordInput
          icon={Lock} placeholder="Password" required minLength={mode === "signup" ? 8 : undefined}
          value={password} onChange={(e) => setPassword(e.target.value)}
        />

        {mode === "signin" && (
          <p className="text-xs text-slate-500 -mt-4">
            Forgot your password? Contact a farm owner to reset it.
          </p>
        )}

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
            "w-full py-3 rounded-full text-sm font-semibold transition-all",
            "bg-brand-green text-black hover:bg-brand-green/90 disabled:opacity-50",
          )}
        >
          {busy
            ? (mode === "signin" ? "Signing in…" : "Creating account…")
            : (mode === "signin" ? "Sign In" : "Create Account")}
        </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <AuthForm />
      </Suspense>
    </AuthShell>
  );
}
