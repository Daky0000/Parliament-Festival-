"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Mail } from "lucide-react";
import { ToastContainer, type ToastItem, type ToastType } from "@/components/super-admin/Toast";

let toastCounter = 0;
function nextToastId() {
  toastCounter += 1;
  return `toast-${toastCounter}`;
}

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
const btn = "px-3 py-2 rounded-[10px] text-[13px] font-medium border border-white/[0.14] hover:bg-white/[0.08] disabled:opacity-50 transition-colors";

async function call(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.details?.[0]?.message || data?.error || "Request failed");
  return data;
}

export function UsersClientView({ events, roles, selfId }: { events: { id: string; name: string }[]; roles: Role[]; selfId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "warning"; message: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", roleKey: "usher", eventId: "" });
  const [busy, setBusy] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [actionBusy, setActionBusy] = useState<{ userId: string; action: string } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [reloadKey, setReloadKey] = useState(0);
  const load = async () => setReloadKey((k) => k + 1);

  const addToast = useCallback((type: ToastType, title: string, message: string) => {
    const id = nextToastId();
    setToasts((prev) => [...prev.slice(-3), { id, type, title, message }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const copyLink = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      addToast("success", "Link Copied", "Activation link copied to clipboard.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      addToast("error", "Copy Failed", "Please manually copy the activation link.");
    }
  };

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

  async function act(userId: string, body: Record<string, unknown>, confirmText?: string, targetName?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    setNotice(null);
    const actionName = String(body.action || "action");
    setActionBusy({ userId, action: actionName });
    const name = targetName || "User";

    try {
      const data = await call(`/api/v1/admin/users/${userId}`, body);

      if (actionName === "reissue_invite") {
        if (data?.data?.activationUrl) {
          setLink(data.data.activationUrl);
          if (data.data.emailSent) {
            addToast("email", "Email Sent Successfully", `Live invitation email dispatched to ${name}.`);
            setNotice({
              type: "success",
              message: `A fresh invitation email has been sent to ${name}. The activation link is also shown below.`,
            });
          } else {
            addToast("warning", "Invite Link Generated", `New link ready, but email could not be sent: ${data.data.emailError}`);
            setNotice({
              type: "warning",
              message: `New link generated, but email could not be delivered (${data.data.emailError}). Please copy the link below.`,
            });
          }
        }
      } else if (actionName === "suspend") {
        addToast("warning", "Account Suspended", `${name} has been suspended and signed out.`);
      } else if (actionName === "reactivate") {
        addToast("success", "Account Reactivated", `${name}'s account is active again.`);
      } else if (actionName === "revoke_sessions") {
        addToast("info", "Sessions Revoked", `Signed out ${name} on all active devices.`);
      } else if (actionName === "reset_mfa") {
        addToast("info", "Two-Step Reset", `Two-step verification reset for ${name}.`);
      } else if (actionName === "require_mfa") {
        addToast("info", "Two-Step Required", `Two-step verification is now required for ${name}.`);
      } else if (actionName === "grant_role") {
        addToast("success", "Role Granted", `Assigned role to ${name}.`);
      } else if (actionName === "revoke_role") {
        addToast("info", "Role Removed", `Removed role assignment from ${name}.`);
      }

      await load();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      addToast("error", "Action Failed", msg);
    } finally {
      setActionBusy(null);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const targetEmail = form.email;
    const targetName = form.fullName;

    try {
      const data = await call("/api/v1/admin/users", { ...form, eventId: form.eventId || null });
      setLink(data.data.activationUrl);

      if (data?.data?.emailSent) {
        setInviteSuccess(true);
        setTimeout(() => setInviteSuccess(false), 3000);
        addToast(
          "email",
          "Email Sent Successfully",
          `Live invitation email dispatched to ${targetEmail}.`
        );
        setNotice({
          type: "success",
          message: `Invitation email sent successfully to ${targetEmail}. The activation link is also displayed below as a backup.`,
        });
      } else {
        addToast(
          "warning",
          "User Created (Email Notice)",
          `User created, but email could not be delivered: ${data?.data?.emailError || "Email provider unavailable"}`
        );
        setNotice({
          type: "warning",
          message: `User account created, but the invitation email could not be delivered (${data?.data?.emailError || "Email provider unavailable"}). Please copy the activation link below and share it directly with ${targetName}.`,
        });
      }

      setForm({ fullName: "", email: "", roleKey: form.roleKey, eventId: form.eventId });
      await load();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      addToast("error", "Invitation Failed", msg);
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
      {notice && (
        <div
          role="status"
          className={`text-[14px] rounded-[10px] px-3.5 py-2.5 border ${
            notice.type === "success"
              ? "text-[#A6F4C5] bg-[#053321]/40 border-[#A6F4C5]/30"
              : "text-[#FEDF89] bg-[#4E2B06]/40 border-[#FEDF89]/30"
          }`}
        >
          {notice.message}
        </div>
      )}
      {link && (
        <div role="status" className="band p-4 space-y-2 border border-[#8FB2FF]/30 shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-medium text-white">Activation link (valid 72 hours)</p>
            {notice?.type === "success" && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-[#A6F4C5] bg-[#053321] px-2.5 py-1 rounded-full border border-[#A6F4C5]/30 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Live Email Dispatched
              </span>
            )}
          </div>
          <code className="block break-all text-[13px] text-[#8FB2FF] bg-black/30 p-2.5 rounded-lg border border-white/10 font-mono">
            {link}
          </code>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className={`${btn} inline-flex items-center gap-1.5`}
              onClick={() => copyLink(link)}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#A6F4C5]" />
                  <span className="text-[#A6F4C5] font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-white/70" />
                  <span>Copy link</span>
                </>
              )}
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                setLink(null);
                setNotice(null);
              }}
            >
              Done
            </button>
          </div>
          <p className="text-[12px] text-white/60">
            {notice?.type === "success"
              ? "The recipient has been sent an official invitation email containing this link. You may also copy it manually."
              : "Anyone with this link can set the account password and activate their profile."}
          </p>
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
        <button
          type="submit"
          disabled={busy}
          className={`px-4 py-2.5 rounded-[10px] text-[14px] font-medium transition-all duration-200 inline-flex items-center justify-center gap-2 ${
            inviteSuccess
              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
              : "bg-[#2563EB] hover:bg-[#1D4ED8] text-white"
          } disabled:opacity-50`}
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Sending email…</span>
            </>
          ) : inviteSuccess ? (
            <>
              <Check className="w-4 h-4" />
              <span>Email Dispatched!</span>
            </>
          ) : (
            <>
              <Mail className="w-4 h-4" />
              <span>Invite user</span>
            </>
          )}
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
            {users.map((u) => {
              const isRowBusy = actionBusy?.userId === u.id;
              return (
                <tr key={u.id} className="border-t border-white/[0.08] align-top hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.fullName}{u.id === selfId && " (you)"}</div>
                    <div className="text-white/60">{u.email}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium ${
                        u.status === "active"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : u.status === "invited"
                          ? "bg-[#8FB2FF]/10 text-[#8FB2FF] border border-[#8FB2FF]/20"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 space-y-1">
                    {u.roles.map((r) => (
                      <div key={r.assignmentId} className="flex items-center gap-2">
                        <span>{r.roleName}{r.event ? ` · ${r.event.name}` : " · all events"}</span>
                        {u.id !== selfId && (
                          <button
                            type="button"
                            disabled={isRowBusy}
                            className="text-[#FDA29B] hover:text-red-300 underline disabled:opacity-40 inline-flex items-center gap-1"
                            onClick={() => act(u.id, { action: "revoke_role", assignmentId: r.assignmentId }, `Remove ${r.roleName} from ${u.fullName}?`, u.fullName)}
                          >
                            {isRowBusy && actionBusy?.action === "revoke_role" && (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            )}
                            remove
                          </button>
                        )}
                      </div>
                    ))}
                    {u.id !== selfId && (
                      <select
                        aria-label={`Add role for ${u.fullName}`}
                        className={`${field} mt-1`}
                        defaultValue=""
                        disabled={isRowBusy}
                        onChange={(e) => {
                          const v = e.target.value;
                          e.target.value = "";
                          if (v) act(u.id, { action: "grant_role", roleKey: v, eventId: null }, undefined, u.fullName);
                        }}
                      >
                        <option value="" className="text-black">+ Add role (all events)</option>
                        {roles.map((r) => <option key={r.key} value={r.key} className="text-black">{r.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">{u.mfaEnabled ? "On" : u.mfaRequired ? "Required" : "Off"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {u.status === "invited" && (
                        <button
                          type="button"
                          disabled={isRowBusy}
                          className={`${btn} text-[#8FB2FF] border-[#8FB2FF]/30 hover:bg-[#8FB2FF]/10 inline-flex items-center gap-1.5`}
                          onClick={() => act(u.id, { action: "reissue_invite" }, undefined, u.fullName)}
                        >
                          {isRowBusy && actionBusy?.action === "reissue_invite" ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Sending…</span>
                            </>
                          ) : (
                            <>
                              <Mail className="w-3 h-3" />
                              <span>Resend invite</span>
                            </>
                          )}
                        </button>
                      )}
                      {u.id !== selfId && u.status === "active" && (
                        <button
                          type="button"
                          disabled={isRowBusy}
                          className={`${btn} text-[#FDA29B] border-[#FDA29B]/30 hover:bg-[#55160C]/30 inline-flex items-center gap-1.5`}
                          onClick={() => act(u.id, { action: "suspend" }, `Suspend ${u.fullName}? They are signed out immediately.`, u.fullName)}
                        >
                          {isRowBusy && actionBusy?.action === "suspend" ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Suspending…</span>
                            </>
                          ) : (
                            <span>Suspend</span>
                          )}
                        </button>
                      )}
                      {u.status === "suspended" && (
                        <button
                          type="button"
                          disabled={isRowBusy}
                          className={`${btn} text-emerald-400 border-emerald-400/30 hover:bg-emerald-500/10 inline-flex items-center gap-1.5`}
                          onClick={() => act(u.id, { action: "reactivate" }, undefined, u.fullName)}
                        >
                          {isRowBusy && actionBusy?.action === "reactivate" ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Reactivating…</span>
                            </>
                          ) : (
                            <span>Reactivate</span>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isRowBusy}
                        className={`${btn} inline-flex items-center gap-1.5`}
                        onClick={() => act(u.id, { action: "revoke_sessions" }, `Sign ${u.fullName} out on every device?`, u.fullName)}
                      >
                        {isRowBusy && actionBusy?.action === "revoke_sessions" ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Signing out…</span>
                          </>
                        ) : (
                          <span>Sign out everywhere</span>
                        )}
                      </button>
                      {u.id !== selfId && u.mfaEnabled && (
                        <button
                          type="button"
                          disabled={isRowBusy}
                          className={`${btn} inline-flex items-center gap-1.5`}
                          onClick={() => act(u.id, { action: "reset_mfa" }, `Reset two-step verification for ${u.fullName}? They must set it up again.`, u.fullName)}
                        >
                          {isRowBusy && actionBusy?.action === "reset_mfa" ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Resetting…</span>
                            </>
                          ) : (
                            <span>Reset 2-step</span>
                          )}
                        </button>
                      )}
                      {u.id !== selfId && !u.mfaRequired && (
                        <button
                          type="button"
                          disabled={isRowBusy}
                          className={`${btn} inline-flex items-center gap-1.5`}
                          onClick={() => act(u.id, { action: "require_mfa", required: true }, undefined, u.fullName)}
                        >
                          {isRowBusy && actionBusy?.action === "require_mfa" ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Saving…</span>
                            </>
                          ) : (
                            <span>Require 2-step</span>
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
