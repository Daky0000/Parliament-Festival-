"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell, FormError, buttonClass, inputClass, labelClass, postJson, safeNext } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { mfa } = await postJson<{ mfa: "none" | "verify" | "enroll" }>("/api/auth/login", { email, password });
      if (mfa === "none") {
        router.push(next);
        router.refresh();
      } else {
        router.push(`/login/mfa?mode=${mfa}&next=${encodeURIComponent(next)}`);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className={labelClass}>Email</label>
        <input id="email" type="email" autoComplete="username" required className={inputClass}
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className={labelClass}>Password</label>
          <Link href="/login/forgot" className="text-[13px] text-[#2563EB] hover:underline">Forgot password?</Link>
        </div>
        <PasswordInput id="password" autoComplete="current-password" value={password} onChange={setPassword} />
      </div>
      <FormError message={error} />
      <button type="submit" className={buttonClass} disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-[13px] text-brand-muted">
        New staff member? Use the activation link your administrator sent you.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell title="Sign in" subtitle="Event & Protocol Platform">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
