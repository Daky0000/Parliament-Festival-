"use client";

import { use, useState } from "react";
import Link from "next/link";
import { AuthShell, FormError, buttonClass, labelClass, postJson } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // The token goes in the POST body, never in a query string or log.
      await postJson("/api/auth/reset", { token, password });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell title="Password changed" subtitle="Sign in with your new password.">
        <Link href="/login" className={`${buttonClass} block text-center`}>Go to sign in</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 12 characters.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className={labelClass}>New password</label>
          <PasswordInput id="password" autoComplete="new-password" minLength={12} value={password} onChange={setPassword} />
        </div>
        <div>
          <label htmlFor="confirm" className={labelClass}>Confirm password</label>
          <PasswordInput id="confirm" autoComplete="new-password" minLength={12} value={confirm} onChange={setConfirm} />
        </div>
        <FormError message={error} />
        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Saving…" : "Save new password"}
        </button>
        <p className="text-[13px] text-brand-muted">
          Link expired? <Link href="/login/forgot" className="text-[#2563EB] hover:underline">Request a new one</Link>
        </p>
      </form>
    </AuthShell>
  );
}
