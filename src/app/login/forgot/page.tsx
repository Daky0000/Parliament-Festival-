"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell, FormError, buttonClass, inputClass, labelClass, postJson } from "@/components/auth/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/auth/forgot", { email });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Reset password" subtitle="We will email you a link to choose a new password.">
      {sent ? (
        <div className="space-y-4">
          <p role="status" className="text-[14px] text-brand-ink">
            If an active account uses <strong>{email}</strong>, a reset link is on its way. It works for 1 hour.
            Check your spam folder if it does not arrive.
          </p>
          <Link href="/login" className={`${buttonClass} block text-center`}>Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className={labelClass}>Email</label>
            <input id="email" type="email" autoComplete="username" required className={inputClass}
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <FormError message={error} />
          <button type="submit" className={buttonClass} disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
          <p className="text-[13px] text-brand-muted">
            Remembered it? <Link href="/login" className="text-[#2563EB] hover:underline">Back to sign in</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
