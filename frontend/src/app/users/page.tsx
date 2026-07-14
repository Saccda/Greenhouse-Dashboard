"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Users, UserPlus, Trash2, KeyRound, ShieldAlert, UserCheck, Clock } from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";

import { API_BASE } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface ManagedUser {
  username:     string;
  role:         string;
  created_at:   string | null;
  email:        string | null;
  display_name: string | null;
}

function authHeaders(token: string | null): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function UsersPage() {
  const router = useRouter();
  const { user, token, loading: authLoading } = useAuth();

  const canManage = !!user && user.role === "owner";

  const { data, error, mutate } = useSWR<{ users: ManagedUser[] }>(
    canManage ? "/api/users" : null,
    (path: string) =>
      fetch(`${API_BASE}${path}`, { headers: authHeaders(token) }).then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      }),
  );

  const pendingUsers  = data?.users.filter((u) => u.role === "pending") ?? [];
  const approvedUsers = data?.users.filter((u) => u.role !== "pending") ?? [];

  useEffect(() => {
    if (!authLoading && !canManage) router.replace("/settings");
  }, [authLoading, canManage, router]);

  // ── Create user ────────────────────────────────────────────────────────
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole,     setNewRole]     = useState("developer");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating,    setCreating]    = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method:  "POST",
        headers: authHeaders(token),
        body:    JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Failed (${res.status})`);
      }
      setNewUsername("");
      setNewPassword("");
      setNewRole("developer");
      mutate();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  // ── Row actions ────────────────────────────────────────────────────────
  const handleRoleChange = useCallback(async (username: string, role: string) => {
    await fetch(`${API_BASE}/api/users/${encodeURIComponent(username)}`, {
      method:  "PATCH",
      headers: authHeaders(token),
      body:    JSON.stringify({ role }),
    });
    mutate();
  }, [token, mutate]);

  const handleDelete = useCallback(async (username: string) => {
    if (!confirm(`Delete user "${username}"? This can't be undone.`)) return;
    const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(username)}`, {
      method:  "DELETE",
      headers: authHeaders(token),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail ?? `Failed to delete (${res.status})`);
    }
    mutate();
  }, [token, mutate]);

  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(resetTarget)}`, {
      method:  "PATCH",
      headers: authHeaders(token),
      body:    JSON.stringify({ password: resetPassword }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setResetError(body?.detail ?? `Failed (${res.status})`);
      return;
    }
    setResetTarget(null);
    setResetPassword("");
    setResetError(null);
  };

  if (authLoading || !canManage) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-sm text-slate-500">
        {authLoading ? "Loading…" : "Redirecting…"}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex items-center gap-2 px-5 py-3.5 bg-surface-card border-b border-surface-border shrink-0">
        <Users size={16} className="text-slate-400" />
        <h1 className="text-sm font-semibold text-slate-200">User Management</h1>
        <span className="ml-2 text-[11px] text-slate-500">Owner-only</span>
      </header>

      <main className="flex-1 overflow-y-auto p-5 space-y-5 max-w-3xl">

        {/* ── Add user ── */}
        <section className="bg-surface-card border border-surface-border rounded-xl p-5">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            <UserPlus size={13} /> Add User
          </h2>
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-slate-500">Username</label>
              <input
                type="text" required value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-40 bg-surface-hover border border-surface-bright text-slate-200 text-sm rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-green/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-slate-500">Password</label>
              <input
                type="password" required minLength={8} value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-40 bg-surface-hover border border-surface-bright text-slate-200 text-sm rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-green/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-slate-500">Role</label>
              <select
                value={newRole} onChange={(e) => setNewRole(e.target.value)}
                className="bg-surface-hover border border-surface-bright text-slate-200 text-sm rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-green/50"
              >
                <option value="developer">Developer</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-1.5 rounded-md text-sm font-medium bg-brand-green text-black hover:bg-brand-green/90 disabled:opacity-50"
            >
              {creating ? "Adding…" : "Add User"}
            </button>
          </form>
          {createError && (
            <p className="flex items-center gap-1.5 text-xs text-red-400 mt-3">
              <ShieldAlert size={13} /> {createError}
            </p>
          )}
        </section>

        {error && <p className="text-xs text-red-400">Could not load users.</p>}
        {!data && !error && <p className="text-xs text-slate-500">Loading…</p>}

        {data && pendingUsers.length > 0 && (
          <section className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-5">
            <h2 className="flex items-center gap-2 text-xs font-semibold text-amber-500 uppercase tracking-wider mb-4">
              <Clock size={13} /> Pending Approval ({pendingUsers.length})
            </h2>
            <div className="space-y-2">
              {pendingUsers.map((u) => (
                <div key={u.username} className="flex flex-wrap items-center gap-3 py-2.5 border-b border-amber-500/20 last:border-0">
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm text-slate-200 font-medium">{u.display_name || u.username}</p>
                    <p className="text-[11px] text-slate-500">
                      @{u.username}{u.email ? `  ·  ${u.email}` : ""}
                      {u.created_at ? `  ·  requested ${format(new Date(u.created_at), "MMM d, yyyy")}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRoleChange(u.username, "developer")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-brand-green text-black hover:bg-brand-green/90"
                  >
                    <UserCheck size={13} /> Approve as Developer
                  </button>
                  <button
                    onClick={() => handleRoleChange(u.username, "owner")}
                    className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-300 border border-surface-bright hover:bg-surface-hover"
                  >
                    Approve as Owner
                  </button>
                  <button
                    onClick={() => handleDelete(u.username)}
                    title="Reject / delete"
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── User list ── */}
        <section className="bg-surface-card border border-surface-border rounded-xl p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Accounts
          </h2>
          {data && (
            <div className="space-y-2">
              {approvedUsers.map((u) => (
                <div key={u.username} className="flex flex-wrap items-center gap-3 py-2.5 border-b border-surface-border last:border-0">
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm text-slate-200 font-medium">{u.display_name || u.username}</p>
                    <p className="text-[11px] text-slate-500">
                      @{u.username}{u.email ? `  ·  ${u.email}` : ""}
                      {u.created_at ? `  ·  since ${format(new Date(u.created_at), "MMM d, yyyy")}` : ""}
                      {u.username === user?.username && "  ·  you"}
                    </p>
                  </div>
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.username, e.target.value)}
                    className="bg-surface-hover border border-surface-bright text-slate-200 text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-green/50 capitalize"
                  >
                    <option value="developer">Developer</option>
                    <option value="owner">Owner</option>
                    <option value="pending">Pending (suspend)</option>
                  </select>
                  <button
                    onClick={() => { setResetTarget(u.username); setResetPassword(""); setResetError(null); }}
                    title="Reset password"
                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-surface-hover"
                  >
                    <KeyRound size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(u.username)}
                    title="Delete user"
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {approvedUsers.length === 0 && (
                <p className="text-xs text-slate-500">No approved accounts yet.</p>
              )}
            </div>
          )}
        </section>

        {/* ── Reset password inline panel ── */}
        {resetTarget && (
          <section className="bg-surface-card border border-brand-green/30 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Reset password — {resetTarget}
            </h2>
            <form onSubmit={handleResetPassword} className="flex items-end gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-500">New password</label>
                <input
                  type="password" required minLength={8} autoFocus value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="w-48 bg-surface-hover border border-surface-bright text-slate-200 text-sm rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-green/50"
                />
              </div>
              <button type="submit" className="px-4 py-1.5 rounded-md text-sm font-medium bg-brand-green text-black hover:bg-brand-green/90">
                Set Password
              </button>
              <button
                type="button"
                onClick={() => { setResetTarget(null); setResetError(null); }}
                className={clsx("px-4 py-1.5 rounded-md text-sm font-medium text-slate-400 hover:text-slate-200 border border-surface-border")}
              >
                Cancel
              </button>
            </form>
            {resetError && <p className="text-xs text-red-400 mt-2">{resetError}</p>}
          </section>
        )}

      </main>
    </div>
  );
}
