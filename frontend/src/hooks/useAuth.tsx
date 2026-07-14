"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { API_BASE } from "@/lib/api";

export interface AuthUser {
  username: string;
  role:     string;
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
  token:    string | null;
  loading:  boolean;
  login:    (username: string, password: string) => Promise<AuthResult>;
  register: (input: RegisterInput) => Promise<AuthResult>;
  logout:   () => void;
}

const TOKEN_KEY = "gh_auth_token";
const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Decode the token's payload segment only — no signature check client-side.
 * Real enforcement always happens server-side; this is purely for display
 * and for noticing a client-side-obvious expiry without a network round trip.
 */
function decodePayload(token: string): { u: string; r: string; exp: number } | null {
  try {
    const [payloadB64] = token.split(".");
    return JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function userFromToken(token: string | null): AuthUser | null {
  if (!token) return null;
  const payload = decodePayload(token);
  if (!payload || payload.exp * 1000 < Date.now()) return null;
  return { username: payload.u, role: payload.r };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    setToken(userFromToken(stored) ? stored : null);
    setLoading(false);
  }, []);

  const postAuth = async (path: string, body: object): Promise<AuthResult> => {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        return { ok: false, error: errBody?.detail ?? "Request failed" };
      }
      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
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
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user: userFromToken(token), token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
