"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import {
  Archive,
  BarChart3,
  EyeOff,
  FileText,
  KeyRound,
  Loader2,
  ScrollText,
  Shield,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { ConvexGate } from "@/components/ConvexGate";

// convex/_generated types predate the admin module; the runtime api proxy
// resolves these dynamically (verified at deploy). Cast keeps TS happy.
const adminApi = (api as unknown as Record<string, Record<string, any>>).admin;

export default function AdminPage() {
  return (
    <ConvexGate module="ADMIN CONTROL">
      <AdminPanel />
    </ConvexGate>
  );
}

function AdminPanel() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "users" | "sessions" | "library" | "usage" | "audit">("overview");
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setSessionToken(localStorage.getItem("jarvis.sessionToken"));
    setRole(localStorage.getItem("jarvis.role"));
  }, []);

  const stats = useQuery(adminApi.systemStats, sessionToken ? { sessionToken } : "skip") as any;
  const users = useQuery(adminApi.listUsers, sessionToken && tab === "users" ? { sessionToken } : "skip") as any[];
  const sessions = useQuery(adminApi.listSessions, sessionToken && tab === "sessions" ? { sessionToken } : "skip") as any[];
  const audit = useQuery(
    adminApi.recentAudit,
    sessionToken && tab === "audit" ? { sessionToken, limit: 120 } : "skip"
  ) as any[];

  const setUserRole = useMutation(adminApi.setUserRole);
  const deleteUser = useMutation(adminApi.deleteUser);
  const revokeSession = useMutation(adminApi.revokeSession);
  const revokeUserSessions = useMutation(adminApi.revokeUserSessions);
  const setDormant = useMutation(adminApi.setDormant);

  if (role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="hud-panel hud-corner max-w-md p-8 text-center">
          <Shield size={36} className="mx-auto mb-3 text-rose-400/70" />
          <p className="hud-label mb-2">ADMIN CLEARANCE REQUIRED</p>
          <p className="font-mono text-xs leading-relaxed text-cyan-200/70">
            This console is restricted to the platform administrator. Sign in with the owner
            account to manage users, sessions, and audit trails.
          </p>
          <a href="/dashboard" className="hud-btn mt-5 text-xs">◂ BACK TO DECK</a>
        </div>
      </main>
    );
  }

  const act = async (id: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusyId(id);
    setNotice(null);
    try {
      await fn();
      setNotice(`✅ ${okMsg}`);
    } catch (e) {
      setNotice(`⚠ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="flex h-screen flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-400/15 bg-slate-950/40 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="hud-btn !py-1 text-[10px]">◂ DECK</a>
          <p className="hud-label flex items-center gap-2 glitch-flicker">
            <Shield size={13} className="text-emerald-300" /> ADMIN CONTROL // ROOT ACCESS
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["overview", "users", "sessions", "library", "usage", "audit"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`hud-btn !px-3 !py-1 text-[10px] ${tab === t ? "!border-emerald-400/60 !text-emerald-300" : ""}`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {notice && (
          <p className="mb-4 rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-3 font-mono text-xs text-cyan-100">{notice}</p>
        )}

        {tab === "overview" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {stats && (
                <>
                  <StatCard icon={<Users size={16} />} label="USERS" value={stats.users} sub={`${stats.admins} admin · ${stats.guests} guest${stats.dormant ? ` · ${stats.dormant} dormant` : ""}`} />
                  <StatCard icon={<FileText size={16} />} label="DOCUMENTS" value={stats.documents} sub={`${(stats.storageBytes / 1e6).toFixed(1)} MB corpus`} />
                  <StatCard icon={<Archive size={16} />} label="CENTRAL ARCHIVE" value={stats.centralDocs ?? 0} sub={`${((stats.centralBytes ?? 0) / 1e6).toFixed(1)} MB public · ${stats.vaultDocs ?? 0} vault docs`} />
                  <StatCard icon={<KeyRound size={16} />} label="ACTIVE SESSIONS" value={stats.activeSessions} sub="live authenticated devices" />
                  <StatCard icon={<BarChart3 size={16} />} label="AI SESSIONS" value={stats.aiSessions} sub={`${stats.chatRooms} chat rooms`} />
                </>
              )}
            </div>
            <p className="mt-6 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-4 font-mono text-[10px] leading-relaxed text-emerald-200/70">
              ROOT AUTHORITY: you can change anyone's role, force-delete accounts (with full data
              cascade), kick sessions/devices, and inspect the immutable audit trail — every
              action here is validated server-side against your admin role and logged.
            </p>
          </>
        )}

        {tab === "library" && <AdminLibrary sessionToken={sessionToken} />}

        {tab === "usage" && <AdminUsage sessionToken={sessionToken} />}

        {tab === "users" && (
          <div className="space-y-2">
            {(users ?? []).map((u) => (
              <div key={u._id} className="hud-panel flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-cyan-100">
                    {u.displayName} <span className="text-cyan-500/60">· {u.email}</span>
                    {u.dormant && (
                      <span className="ml-2 rounded bg-amber-400/15 px-1.5 py-0.5 text-[8px] text-amber-300">DORMANT</span>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] text-slate-500">
                    {u.role}{u.hasPin ? " · PIN set" : ""} · joined {new Date(u.createdAt).toLocaleDateString()}
                    {u.lastSeenAt ? ` · seen ${new Date(u.lastSeenAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <select
                  value={u.role}
                  onChange={(e) => act(u._id, () => setUserRole({ sessionToken, userId: u._id, role: e.target.value as any }), `role → ${e.target.value} for ${u.email}`)}
                  className="rounded border border-cyan-400/30 bg-slate-950/70 px-2 py-1 font-mono text-[10px] text-cyan-100"
                >
                  {["admin", "member", "guest"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  disabled={busyId === u._id}
                  onClick={() => act(u._id, () => revokeUserSessions({ sessionToken, userId: u._id }), `kicked all sessions of ${u.email}`)}
                  className="hud-btn !px-2 !py-1 text-[9px]"
                  title="Force logout on all devices"
                >
                  KICK
                </button>
                <button
                  disabled={busyId === u._id}
                  onClick={() =>
                    act(
                      u._id,
                      () => setDormant({ sessionToken, userId: u._id, dormant: !u.dormant }),
                      u.dormant ? `reactivated ${u.email}` : `${u.email} set dormant`
                    )
                  }
                  className="hud-btn !px-2 !py-1 text-[9px] !text-amber-300"
                  title={u.dormant ? "Reactivate this account" : "Mark dormant (account preserved, sessions killed)"}
                >
                  {u.dormant ? "ACTIVATE" : "DORMANT"}
                </button>
                <button
                  disabled={busyId === u._id}
                  onClick={() => {
                    if (confirm(`Delete ${u.email} and ALL their data? This cannot be undone.`)) {
                      void act(u._id, () => deleteUser({ sessionToken, userId: u._id }), `deleted ${u.email}`);
                    }
                  }}
                  className="rounded p-1.5 text-rose-300/70 hover:bg-rose-400/10"
                  title="Delete account + data"
                >
                  {busyId === u._id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "sessions" && (
          <div className="space-y-2">
            {(sessions ?? []).map((s) => (
              <div key={s._id} className="hud-panel flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-cyan-100">{s.email}</p>
                  <p className="font-mono text-[9px] text-slate-500">
                    {s.role} · {s.expired ? "EXPIRED" : "active"} · started {new Date(s.createdAt).toLocaleString()}
                    {s.lastUsedAt ? ` · used ${new Date(s.lastUsedAt).toLocaleString()}` : ""}
                  </p>
                </div>
                {!s.expired && (
                  <button
                    onClick={() => act(s._id, () => revokeSession({ sessionToken, sessionId: s._id }), "session revoked")}
                    className="hud-btn !px-2 !py-1 text-[9px] !text-rose-300"
                  >
                    REVOKE
                  </button>
                )}
              </div>
            ))}
            {sessions && sessions.length === 0 && <p className="font-mono text-[11px] text-slate-500">no sessions yet</p>}
          </div>
        )}

        {tab === "audit" && (
          <div className="space-y-1.5">
            {(audit ?? []).map((a) => (
              <div key={a._id} className="flex items-center gap-3 rounded border border-cyan-400/10 bg-slate-900/40 px-3 py-2 font-mono text-[10px]">
                <ScrollText size={11} className="shrink-0 text-cyan-400/60" />
                <span className="text-cyan-300">{a.action}</span>
                <span className="text-slate-400">by {a.actorEmail}</span>
                {a.metadata && <span className="truncate text-slate-600">{JSON.stringify(a.metadata)}</span>}
                <span className="ml-auto shrink-0 text-slate-600">{new Date(a.createdAt).toLocaleString()}</span>
              </div>
            ))}
            {audit && audit.length === 0 && <p className="font-mono text-[11px] text-slate-500">audit trail empty</p>}
          </div>
        )}
      </div>
    </main>
  );
}

function AdminLibrary({ sessionToken }: { sessionToken: string | null }) {
  const docs = useQuery(
    adminApi.oversight,
    sessionToken ? { sessionToken } : "skip"
  ) as any[] | undefined;
  const setDocVisibility = useMutation(adminApi.setDocVisibility);
  const adminDestroyDoc = useMutation(adminApi.adminDestroyDoc);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"all" | "central" | "private" | "trashed">("all");

  const filtered = (docs ?? [])
    .filter((d) => (scope === "trashed" ? d.trashed : scope === "all" ? true : (d.visibility ?? "private") === scope))
    .filter((d) => (q ? d.title.toLowerCase().includes(q.toLowerCase()) || (d.ownerEmail ?? "").toLowerCase().includes(q.toLowerCase()) : true));

  const curate = async (id: string, visibility: "central" | "private", title: string) => {
    setNotice(null);
    try {
      await setDocVisibility({ sessionToken, documentId: id, visibility });
      setNotice(`✅ ${visibility === "central" ? "Published to" : "Unpublished from"} ARCHIVE: ${title}`);
    } catch (e) {
      setNotice(`⚠ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const destroy = async (id: string, title: string) => {
    if (!confirm(`Permanently destroy "${title}" (chunks + stored file)? This cannot be undone.`)) return;
    setNotice(null);
    try {
      await adminDestroyDoc({ sessionToken, documentId: id });
      setNotice(`✅ Destroyed: ${title}`);
    } catch (e) {
      setNotice(`⚠ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="space-y-2">
      <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 font-mono text-[10px] text-emerald-200/70">
        LIBRARY CURATION: publish vault documents into the CENTRAL ARCHIVE, unpublish, or force-destroy.
        Content stays end-user private — you see metadata only, and every curation action is audit-logged.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {(["all", "central", "private", "trashed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`hud-btn !px-2.5 !py-0.5 text-[9px] ${scope === s ? "!border-emerald-400/60 !text-emerald-300" : ""}`}
          >
            {s.toUpperCase()}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="filter by title or owner…"
          className="ml-2 w-48 rounded border border-cyan-400/30 bg-slate-950/60 px-2 py-1 font-mono text-[10px] text-cyan-100 outline-none"
        />
      </div>
      {notice && <p className="rounded border border-cyan-400/30 bg-cyan-400/10 p-2 font-mono text-[10px] text-cyan-100">{notice}</p>}
      {!docs && <p className="animate-pulse font-mono text-xs text-cyan-500/60">scanning corpus…</p>}
      {docs && docs.length === 0 && <p className="font-mono text-xs text-cyan-500/60">No documents uploaded yet.</p>}
      {filtered.map((d) => (
        <div
          key={d._id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-400/15 bg-cyan-400/5 px-3 py-2 font-mono text-[11px]"
        >
          <span className="min-w-0 truncate text-cyan-100">{d.title}</span>
          <span className="flex shrink-0 items-center gap-2 text-[9px] tracking-wider">
            <span className={d.visibility === "central" ? "text-cyan-300" : "text-violet-300"}>
              {d.visibility === "central" ? "ARCHIVE" : "VAULT"}
            </span>
            {d.trashed && <span className="rounded bg-rose-400/15 px-1 py-0.5 text-rose-300">TRASHED</span>}
            <span className="text-slate-500">{d.ownerEmail ?? d.ownerId}</span>
            <span className="text-cyan-500/70">{(d.sizeBytes / 1e6).toFixed(2)} MB</span>
            <span className={d.status === "ready" ? "text-emerald-300" : "text-amber-300"}>{d.status}</span>
            {d.visibility === "private" ? (
              <button
                disabled={!sessionToken}
                onClick={() => void curate(d._id, "central", d.title)}
                className="hud-btn !px-2 !py-0.5 text-[8px] !text-amber-300"
                title="Publish into the CENTRAL ARCHIVE (all users can read)"
              >
                <Archive size={9} /> PUBLISH
              </button>
            ) : (
              <button
                disabled={!sessionToken}
                onClick={() => void curate(d._id, "private", d.title)}
                className="hud-btn !px-2 !py-0.5 text-[8px]"
                title="Unpublish back to the owner's private vault"
              >
                <EyeOff size={9} /> UNPUBLISH
              </button>
            )}
            <button
              disabled={!sessionToken}
              onClick={() => void destroy(d._id, d.title)}
              className="rounded p-1 text-rose-300/70 hover:bg-rose-400/10"
              title="Force-destroy (chunks + blobs + row, audited)"
            >
              <Trash2 size={11} />
            </button>
          </span>
        </div>
      ))}
      {docs && filtered.length === 0 && docs.length > 0 && (
        <p className="font-mono text-[11px] text-slate-500">no documents match the current filter</p>
      )}
    </div>
  );
}

/**
 * USAGE tab — per-user storage/doc analytics + 14-day ingest sparkline.
 * Metadata only; renders proportional bars instead of a chart lib.
 */
function AdminUsage({ sessionToken }: { sessionToken: string | null }) {
  const usage = useQuery(
    adminApi.usageByUser,
    sessionToken ? { sessionToken } : "skip"
  ) as any | undefined;

  if (!usage) return <p className="animate-pulse font-mono text-xs text-cyan-500/60">computing usage…</p>;
  const maxBytes = Math.max(1, ...usage.rows.map((r: any) => r.bytes));
  const maxDay = Math.max(1, ...usage.activity.map((a: any) => a.count));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="hud-panel hud-corner p-4">
          <p className="font-mono text-[10px] tracking-wider text-cyan-300/80">CORPUS TOTALS</p>
          <p className="mt-1 font-hud text-2xl text-cyan-100">
            {(usage.totals.bytes / 1e6).toFixed(1)} MB
          </p>
          <p className="font-mono text-[9px] text-slate-500">{usage.totals.docs} documents across {usage.rows.length} owners</p>
        </div>
        <div className="hud-panel hud-corner p-4">
          <p className="font-mono text-[10px] tracking-wider text-cyan-300/80">INGEST / DAY (14d)</p>
          <div className="mt-2 flex h-12 items-end gap-1">
            {usage.activity.map((a: any) => (
              <div
                key={a.dayStart}
                className="flex-1 rounded-t bg-gradient-to-t from-cyan-500/30 to-cyan-300/80"
                style={{ height: `${Math.max(4, (a.count / maxDay) * 100)}%` }}
                title={`${new Date(a.dayStart).toLocaleDateString()} — ${a.count} doc(s)`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="hud-label">STORAGE BY OPERATOR</p>
        {usage.rows.length === 0 && <p className="font-mono text-[11px] text-slate-500">no documents yet</p>}
        {usage.rows.map((r: any) => (
          <div key={r.ownerId} className="rounded-lg border border-cyan-400/15 bg-cyan-400/5 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
              <span className="min-w-0 truncate text-cyan-100">{r.displayName} <span className="text-slate-500">· {r.email}</span></span>
              <span className="shrink-0 text-cyan-300/80">{r.docs} docs · {(r.bytes / 1e6).toFixed(2)} MB{r.central > 0 ? ` · ${r.central} in archive` : ""}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500/60 to-cyan-300"
                style={{ width: `${Math.max(2, (r.bytes / maxBytes) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub: string }) {
  return (
    <div className="hud-panel hud-corner rise-in p-4">
      <div className="flex items-center gap-2 font-mono text-[10px] tracking-wider text-cyan-300/80">
        {icon} {label}
      </div>
      <p className="mt-2 font-hud text-3xl text-cyan-100">{value}</p>
      <p className="mt-1 font-mono text-[9px] text-slate-500">{sub}</p>
    </div>
  );
}
