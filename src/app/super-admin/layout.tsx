import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor, can } from "@/lib/authz";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { ShieldCheck, Cpu, Mail, MessageSquare, ArrowLeft, Server } from "lucide-react";

const tabs = [
  { href: "/super-admin", label: "Platform overview", icon: Server },
  { href: "/super-admin/ai", label: "AI providers (OpenAI / Claude)", icon: Cpu },
  { href: "/super-admin/sms", label: "SMS gateway (Vynfy)", icon: MessageSquare },
  { href: "/super-admin/email", label: "Email (Resend)", icon: Mail },
  { href: "/super-admin/users", label: "Users & roles", icon: ShieldCheck },
];

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Platform administration: super admins only. Every API also checks.
  const actor = await getActor();
  if (!actor) redirect("/login?next=/super-admin");
  if (!can(actor, "platform.manage")) {
    return (
      <main className="min-h-screen p-4 bg-brand-canvas">
        <AccessDenied />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D1526] text-white flex flex-col gap-[var(--frame)] p-[var(--frame)]">
      <header className="band">
        <div className="dotfield" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center gap-4 px-5 sm:px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[14px] text-white/75 hover:text-white bg-white/[0.06] border border-white/[0.12] hover:bg-white/[0.11] px-3 py-2 rounded-[10px] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Event portal
          </Link>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[17px] font-medium tracking-[-0.02em]">DakyXTech Super Admin</span>
              <span className="inline-flex items-center gap-2 bg-white/10 text-[#8FB2FF] rounded-[10px] text-[11px] font-medium uppercase tracking-[0.12em] px-2.5 py-1">
                <span className="w-[7px] h-[7px] rounded-full bg-current" />
                Production control plane
              </span>
            </div>
            <div className="text-[13px] text-white/60 mt-0.5">
              Provider infrastructure, secrets, AI routing and telemetry
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-[14px] font-medium">Platform operations</div>
              <div className="text-[12px] text-[#A3E635]">All systems operational</div>
            </div>
            <span className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-[13px] font-medium">DX</span>
          </div>
        </div>

        <nav
          className="relative flex gap-1 overflow-x-auto px-4 sm:px-5 pb-4 text-[14px]"
          aria-label="Super Admin sections"
        >
          {tabs.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-2 whitespace-nowrap px-3 py-2 rounded-[10px] text-white/75 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <Icon className="w-4 h-4 text-[#8FB2FF]" />
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1 w-full max-w-[1280px] mx-auto space-y-6 py-2">{children}</main>

      <footer className="rounded-[22px] bg-white/[0.04] px-6 py-5 text-[13px] text-white/55 flex flex-wrap items-center justify-center gap-2 text-center">
        <ShieldCheck className="w-4 h-4 text-[#8FB2FF]" />
        <span>DakyXTech Super Admin · Provider credentials encrypted at rest · Zero plaintext secrets in logs</span>
      </footer>
    </div>
  );
}
