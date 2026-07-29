"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { API_BASE } from "@/lib/api";

export interface AuthUser {
  username: string;
  role:     string;
  farms:    string[] | null;   // null = unrestricted (sees every farm)
}

type AuthResult = { ok: true } | { ok: false; error: string };

interface RegisterInput {
  username:    string;
  password:    string;
  email:       string;
  displayName: string;
}

interface AuthContextValue {
  user:     AuthUser | null;
  loading:  boolean;
  login:    (username: string, password: string) => Promise<AuthResult>;
  register: (input: RegisterInput) => Promise<AuthResult>;
  logout:   () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // The session lives in an httpOnly cookie — invisible to JS by design.
  // /me is how the frontend learns who (if anyone) is logged in.
  useEffect(() => {
    fetch(`${API_BASE}/api/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AuthUser | null) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const postAuth = async (path: string, body: object): Promise<AuthResult> => {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        return { ok: false, error: errBody?.detail ?? "Request failed" };
      }
      const data: AuthUser = await res.json();
      setUser(data);
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not reach the server" };
    }
  };

  const login: AuthContextValue["login"] = (username, password) =>
    postAuth("/api/auth/login", { username, password });

  const register: AuthContextValue["register"] = ({ username, password, email, displayName }) =>
    postAuth("/api/auth/register", { username, password, email, display_name: displayName });

  const logout = () => {
    // JS can't clear an httpOnly cookie itself — the backend has to.
    fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
