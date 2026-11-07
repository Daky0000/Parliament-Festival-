"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell, FormError, buttonClass, labelClass, postJson } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";

export default function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      const { mfa } = await postJson<{ mfa: "none" | "verify" | "enroll" }>("/api/auth/activate", { token, password });
      if (mfa === "none") {
        router.push("/");
        router.refresh();
      } else {
        router.push(`/login/mfa?mode=${mfa}`);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Activate your account" subtitle="Choose a password of at least 12 characters.">
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
          {busy ? "Activating…" : "Activate account"}
        </button>
      </form>
    </AuthShell>
  );
}
