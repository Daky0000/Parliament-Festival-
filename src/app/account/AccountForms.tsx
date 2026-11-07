"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormError, buttonClass, labelClass, postJson } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";

export function AccountForms() {
  const router = useRouter();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/auth/password", { currentPassword, newPassword });
      setDone(true);
      setCurrent("");
      setNew("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={changePassword} className="space-y-4">
        <h2 className="text-[15px] font-medium text-brand-ink">Change password</h2>
        <div>
          <label htmlFor="current" className={labelClass}>Current password</label>
          <PasswordInput id="current" autoComplete="current-password" value={currentPassword} onChange={setCurrent} />
        </div>
        <div>
          <label htmlFor="new" className={labelClass}>New password (12+ characters)</label>
          <PasswordInput id="new" autoComplete="new-password" minLength={12} value={newPassword} onChange={setNew} />
        </div>
        <FormError message={error} />
        {done && <p role="status" className="text-[14px] text-[#067647]">Password changed. Other devices were signed out.</p>}
        <button type="submit" className={buttonClass} disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
      </form>
      <div className="flex gap-3">
        <Link href="/" className="flex-1 text-center border border-brand-line2 rounded-[10px] px-4 py-3 text-[15px] text-brand-ink">Back to dashboard</Link>
        <button type="button" onClick={signOut} className="flex-1 border border-brand-line2 rounded-[10px] px-4 py-3 text-[15px] text-brand-ink">Sign out</button>
      </div>
    </div>
  );
}
