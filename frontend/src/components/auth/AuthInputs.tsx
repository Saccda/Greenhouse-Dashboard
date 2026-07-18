"use client";
import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";

const FIELD_CLASS = clsx(
  "w-full bg-surface-hover border border-surface-bright text-slate-200 text-sm rounded-full py-3",
  "focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green/50 transition-colors",
  "placeholder:text-slate-500",
);

interface AuthInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon: LucideIcon;
}

export function AuthInput({ icon: Icon, className, ...props }: AuthInputProps) {
  return (
    <div className="relative">
      <Icon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input {...props} className={clsx(FIELD_CLASS, "pl-11 pr-4", className)} />
    </div>
  );
}

interface AuthPasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  icon: LucideIcon;
}

export function AuthPasswordInput({ icon: Icon, className, ...props }: AuthPasswordInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Icon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type={show ? "text" : "password"}
        {...props}
        className={clsx(FIELD_CLASS, "pl-11 pr-11", className)}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

type Mode = "signin" | "signup";

export function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="relative flex gap-1 bg-surface-hover rounded-full p-1 border border-surface-border">
      <div
        aria-hidden
        className={clsx(
          "absolute left-1 top-1 bottom-1 w-[calc(50%-0.375rem)] bg-brand-green rounded-full transition-transform duration-200 ease-out",
          mode === "signup" && "translate-x-[calc(100%+0.25rem)]",
        )}
      />
      <button
        type="button"
        onClick={() => onChange("signin")}
        className={clsx(
          "relative z-10 flex-1 py-2 text-sm font-medium rounded-full transition-colors",
          mode === "signin" ? "text-black" : "text-slate-400 hover:text-slate-200",
        )}
      >
        Sign In
      </button>
      <button
        type="button"
        onClick={() => onChange("signup")}
        className={clsx(
          "relative z-10 flex-1 py-2 text-sm font-medium rounded-full transition-colors",
          mode === "signup" ? "text-black" : "text-slate-400 hover:text-slate-200",
        )}
      >
        Sign Up
      </button>
    </div>
  );
}
