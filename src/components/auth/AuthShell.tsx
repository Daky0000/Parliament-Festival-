import { BrandMark } from "@/components/layout/Sidebar";

/** Centered card used by sign-in, MFA, activation and account pages. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-brand-canvas grid place-items-center p-4">
      <section className="panel w-full max-w-[420px] p-6 sm:p-8 space-y-6">
        <header className="flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="text-[12px] uppercase tracking-[0.14em] text-brand-muted">Parliament of Ghana</p>
            <h1 className="text-[20px] font-medium tracking-[-0.02em] text-brand-ink">{title}</h1>
          </div>
        </header>
        {subtitle && <p className="text-[14px] text-brand-muted -mt-2">{subtitle}</p>}
        {children}
      </section>
    </main>
  );
}

export const inputClass =
  "w-full border border-brand-line2 rounded-[10px] px-3 py-2.5 text-[15px] text-brand-ink bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]";
export const buttonClass =
  "w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-4 py-3 rounded-[10px] text-[15px] font-medium disabled:opacity-50 transition-colors";
export const labelClass = "block text-[13px] font-medium text-brand-ink mb-1.5";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[14px] text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-[10px] px-3 py-2">
      {message}
    </p>
  );
}

/** POST JSON to our own API; returns parsed body or throws with the server's message. */
export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data?.details) ? data.details[0]?.message : null;
    throw new Error(detail || data?.error || "Something went wrong. Try again.");
  }
  return data as T;
}

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
