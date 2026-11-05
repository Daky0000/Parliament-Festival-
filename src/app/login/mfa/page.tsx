"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { AuthShell, FormError, buttonClass, inputClass, labelClass, postJson, safeNext } from "@/components/auth/AuthShell";

function MfaForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const enrolling = params.get("mode") === "enroll";
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enrolling) return;
    postJson<{ otpauthUrl: string; secret: string }>("/api/auth/mfa/enroll", {})
      .then(async ({ otpauthUrl, secret }) => {
        setSecret(secret);
        setQr(await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }));
      })
      .catch((err) => setError((err as Error).message));
  }, [enrolling]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/auth/mfa/verify", { code });
      router.push(next);
      router.refresh();
    } catch (err) {
      const message = (err as Error).message;
      setError(message === "Unauthorized" ? "Your sign-in expired. Sign in again." : message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {enrolling && (
        <div className="space-y-3 text-[14px] text-brand-ink">
          <p>Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password), then enter the 6-digit code it shows.</p>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="MFA setup QR code" width={220} height={220} className="mx-auto rounded-[10px] border border-brand-line2" />
          ) : (
            <div className="h-[220px] grid place-items-center text-brand-muted">Preparing…</div>
          )}
          {secret && (
            <p className="text-[12px] text-brand-muted break-all">
              Can&rsquo;t scan? Enter this key manually: <code className="text-brand-ink">{secret}</code>
            </p>
          )}
        </div>
      )}
      <div>
        <label htmlFor="code" className={labelClass}>Authentication code</label>
        <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required
          className={`${inputClass} tracking-[0.3em] text-center text-[20px]`}
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      </div>
      <FormError message={error} />
      <button type="submit" className={buttonClass} disabled={busy || code.length !== 6}>
        {busy ? "Checking…" : enrolling ? "Turn on two-step verification" : "Verify"}
      </button>
      <a href="/login" className="block text-center text-[13px] text-brand-muted">Use a different account</a>
    </form>
  );
}

export default function MfaPage() {
  return (
    <AuthShell title="Two-step verification" subtitle="Required for administrator accounts">
      <Suspense>
        <MfaForm />
      </Suspense>
    </AuthShell>
  );
}
