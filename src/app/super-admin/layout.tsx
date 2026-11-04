import Link from "next/link";
import { ShieldCheck, Cpu, Mail, MessageSquare, Cloud, Activity, Lock, ArrowLeft, Server } from "lucide-react";

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#070D18] text-[#F7F5F0] flex flex-col font-sans">
      {/* Super Admin Top Header */}
      <header className="h-16 bg-[#0A1830] border-b border-[#C6A65B]/30 flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-[#DFCA95] hover:text-white transition-colors py-1 px-2 rounded bg-[#102343] border border-[#C6A65B]/30"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Parliament Event Portal</span>
          </Link>
          <div className="h-5 w-px bg-[#C6A65B]/30 hidden sm:block"></div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-editorial font-bold text-sm text-[#C6A65B] tracking-wider uppercase">
                DakyXTech Super Admin
              </span>
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Production Control Plane
              </span>
            </div>
            <div className="text-[10px] text-[#DFCA95]/70">
              Provider Infrastructure, Secrets, AI Routing & Telemetry
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-white">Platform Operations</div>
            <div className="text-[10px] text-emerald-400 font-mono">Status: All Systems Operational</div>
          </div>
          <div className="w-8 h-8 rounded bg-[#102343] border border-[#C6A65B] flex items-center justify-center font-bold text-xs text-[#DFCA95]">
            DX
          </div>
        </div>
      </header>

      {/* Secondary Navigation Ribbon */}
      <div className="bg-[#0D1C38] border-b border-[#C6A65B]/20 px-6 overflow-x-auto">
        <div className="flex items-center gap-1 py-2 text-xs">
          <Link
            href="/super-admin"
            className="px-3 py-1.5 rounded-md hover:bg-[#102343] text-[#DFCA95] hover:text-white font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Server className="w-3.5 h-3.5 text-[#C6A65B]" />
            Platform Overview
          </Link>
          <Link
            href="/super-admin/ai"
            className="px-3 py-1.5 rounded-md hover:bg-[#102343] text-[#DFCA95] hover:text-white font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Cpu className="w-3.5 h-3.5 text-[#C6A65B]" />
            AI Providers (OpenAI / Claude)
          </Link>
          <Link
            href="/super-admin/sms"
            className="px-3 py-1.5 rounded-md hover:bg-[#102343] text-[#DFCA95] hover:text-white font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#C6A65B]" />
            SMS Gateway (Vynfy)
          </Link>
          <Link
            href="/super-admin/email"
            className="px-3 py-1.5 rounded-md hover:bg-[#102343] text-[#DFCA95] hover:text-white font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Mail className="w-3.5 h-3.5 text-[#C6A65B]" />
            Email (Resend)
          </Link>
          <Link
            href="/super-admin/cloudflare"
            className="px-3 py-1.5 rounded-md hover:bg-[#102343] text-[#DFCA95] hover:text-white font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Cloud className="w-3.5 h-3.5 text-[#C6A65B]" />
            Cloudflare & Edge
          </Link>
        </div>
      </div>

      {/* Main Super Admin Workspace */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="p-4 border-t border-[#C6A65B]/20 bg-[#070D18] text-center text-[11px] text-[#DFCA95]/50 flex items-center justify-center gap-2">
        <ShieldCheck className="w-4 h-4 text-[#C6A65B]" />
        <span>DakyXTech Super Admin &bull; Provider Credentials Encrypted at Rest &bull; Zero Plaintext Secrets in Logs</span>
      </footer>
    </div>
  );
}
