"use client";

import { useEffect, useState } from "react";

type Role = { key: string; name: string; description: string };
type UserRow = {
  id: string;
  email: string;
  fullName: string;
  status: string;
  mfaEnabled: boolean;
  mfaRequired: boolean;
  lastLoginAt: string | null;
  roles: { assignmentId: string; roleKey: string; roleName: string; event: { id: string; name: string } | null }[];
};

const field = "w-full bg-white/[0.06] border border-white/[0.14] rounded-[10px] px-3 py-2 text-[14px] text-white";
const btn = "px-3 py-2 rounded-[10px] text-[13px] font-medium border border-white/[0.14] hover:bg-white/[0.08] disabled:opacity-50";

async function call(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.details?.[0]?.message || data?.error || "Request failed");
  return data;
}

export function UsersClientView({ events, roles, selfId }: { events: { id: string; name: string }[]; roles: Role[]; selfId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [mailNote, setMailNote] = useState<{ sent: boolean; to: string; error: string | null } | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", roleKey: "usher", eventId: "" });
  const [busy, setBusy] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const load = async () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/admin/users")
      .then(async (res) => ({ ok: res.ok, data: await res.json() }))
      .then(({ ok, data }) => {
        if (!alive) return;
        if (ok) setUsers(data.data);
        else setError(data.error || "Could not load users");
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  async function act(userId: string, body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    try {
      const data = await call(`/api/v1/admin/users/${userId}`, body);
      if (data?.data?.activationUrl) {
        setLink(data.data.activationUrl);
        setMailNote({ sent: !!data.data.emailSent, to: data.data.emailedTo, error: data.data.emailError ?? null });
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await call("/api/v1/admin/users", { ...form, eventId: form.eventId || null });
      setLink(data.data.activationUrl);
      setMailNote({ sent: !!data.data.emailSent, to: data.data.emailedTo, error: data.data.emailError ?? null });
      setForm({ fullName: "", email: "", roleKey: form.roleKey, eventId: form.eventId });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-editorial text-2xl font-medium text-white">Users &amp; roles</h2>
        <p className="text-xs text-white/60 mt-1">
          Invite staff, assign roles per event, suspend accounts and sign users out. Every change is audited.
        </p>
      </div>

      {error && <p role="alert" className="text-[14px] text-[#FDA29B] bg-[#55160C]/40 rounded-[10px] px-3 py-2">{error}</p>}
      {link && (
        <div role="status" className="band p-4 space-y-2">
          {mailNote && (
            <p className={`text-[14px] font-medium ${mailNote.sent ? "text-[#A3E635]" : "text-[#FDA29B]"}`}>
              {mailNote.sent
                ? `Invitation email sent to ${mailNote.to}. They can activate their account from the email.`
                : `The invitation email could not be sent to ${mailNote.to}${mailNote.error ? `: ${mailNote.error}` : "."} Send them the link below instead.`}
            </p>
          )}
          <p className="text-[14px] font-medium">Activation link (shown once, valid 72 hours)</p>
          <code className="block break-all text-[13px] text-[#8FB2FF]">{link}</code>
          <div className="flex gap-2">
            <button type="button" className={btn} onClick={() => navigator.clipboard.writeText(link)}>Copy link</button>
            <button type="button" className={btn} onClick={() => { setLink(null); setMailNote(null); }}>Done</button>
          </div>
          <p className="text-[12px] text-white/60">A backup in case the email does not arrive. Anyone with this link can set the account password.</p>
        </div>
      )}

      <form onSubmit={invite} className="band p-5 grid gap-3 sm:grid-cols-5 items-end">
        <label className="sm:col-span-1 text-[12px] text-white/70">Full name
          <input className={field} required minLength={2} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </label>
        <label className="sm:col-span-1 text-[12px] text-white/70">Email
          <input className={field} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="text-[12px] text-white/70">Role
          <select className={field} value={form.roleKey} onChange={(e) => setForm({ ...form, roleKey: e.target.value })}>
            {roles.map((r) => <option key={r.key} value={r.key} className="text-black">{r.name}</option>)}
          </select>
        </label>
        <label className="text-[12px] text-white/70">Event scope
          <select className={field} value={form.eventId} onChange={(e) => setForm({ ...form, eventId: e.target.value })}>
            <option value="" className="text-black">All events</option>
            {events.map((ev) => <option key={ev.id} value={ev.id} className="text-black">{ev.name}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy} className="px-4 py-2.5 rounded-[10px] bg-[#2563EB] hover:bg-[#1D4ED8] text-[14px] font-medium disabled:opacity-50">
          {busy ? "Inviting…" : "Invite user"}
        </button>
      </form>

      <div className="band overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-white/60 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Roles</th>
              <th className="px-4 py-3 font-medium">2-step</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-white/[0.08] align-top">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.fullName}{u.id === selfId && " (you)"}</div>
                  <div className="text-white/60">{u.email}</div>
                </td>
                <td className="px-4 py-3 capitalize">{u.status}</td>
                <td className="px-4 py-3 space-y-1">
                  {u.roles.map((r) => (
                    <div key={r.assignmentId} className="flex items-center gap-2">
                      <span>{r.roleName}{r.event ? ` · ${r.event.name}` : " · all events"}</span>
                      {u.id !== selfId && (
                        <button type="button" className="text-[#FDA29B] underline"
                          onClick={() => act(u.id, { action: "revoke_role", assignmentId: r.assignmentId }, `Remove ${r.roleName} from ${u.fullName}?`)}>
                          remove
                        </button>
                      )}
                    </div>
                  ))}
                  {u.id !== selfId && (
                    <select aria-label={`Add role for ${u.fullName}`} className={`${field} mt-1`} defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value;
                        e.target.value = "";
                        if (v) act(u.id, { action: "grant_role", roleKey: v, eventId: null });
                      }}>
                      <option value="" className="text-black">+ Add role (all events)</option>
                      {roles.map((r) => <option key={r.key} value={r.key} className="text-black">{r.name}</option>)}
                    </select>
                  )}
                </td>
                <td className="px-4 py-3">{u.mfaEnabled ? "On" : u.mfaRequired ? "Required" : "Off"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {u.status === "invited" && (
                      <button type="button" className={btn} onClick={() => act(u.id, { action: "reissue_invite" })}>New link</button>
                    )}
                    {u.id !== selfId && u.status === "active" && (
                      <button type="button" className={btn}
                        onClick={() => act(u.id, { action: "suspend" }, `Suspend ${u.fullName}? They are signed out immediately.`)}>
                        Suspend
                      </button>
                    )}
                    {u.status === "suspended" && (
                      <button type="button" className={btn} onClick={() => act(u.id, { action: "reactivate" })}>Reactivate</button>
                    )}
                    <button type="button" className={btn}
                      onClick={() => act(u.id, { action: "revoke_sessions" }, `Sign ${u.fullName} out on every device?`)}>
                      Sign out everywhere
                    </button>
                    {u.id !== selfId && u.mfaEnabled && (
                      <button type="button" className={btn}
                        onClick={() => act(u.id, { action: "reset_mfa" }, `Reset two-step verification for ${u.fullName}? They must set it up again.`)}>
                        Reset 2-step
                      </button>
                    )}
                    {u.id !== selfId && !u.mfaRequired && (
                      <button type="button" className={btn} onClick={() => act(u.id, { action: "require_mfa", required: true })}>Require 2-step</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
