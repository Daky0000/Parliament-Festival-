"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  Award,
  Mail,
  CheckCircle2,
  Armchair,
  QrCode,
  Sparkles,
  ShieldAlert,
  CalendarDays,
  ExternalLink,
} from "lucide-react";

const navigationItems = [
  { name: "Executive Overview", href: "/", icon: LayoutDashboard },
  { name: "Guest Directory", href: "/guests", icon: Users },
  { name: "Import Wizard", href: "/guests/import", icon: FileSpreadsheet },
  { name: "Protocol Precedence", href: "/protocol", icon: Award },
  { name: "Invitation Campaigns", href: "/invitations/campaigns", icon: Mail },
  { name: "RSVP Dashboard", href: "/rsvps", icon: CheckCircle2 },
  { name: "Seating Planner", href: "/seating", icon: Armchair },
  { name: "Arrival & Attendance", href: "/attendance", icon: CalendarDays },
  { name: "AI Command Centre", href: "/ai-centre", icon: Sparkles, badge: "Assisted" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-[#0A1830] text-[#F7F5F0] flex flex-col flex-shrink-0 border-r border-[#C6A65B]/20 min-h-screen">
      {/* Header / Institutional Branding */}
      <div className="p-5 border-b border-[#C6A65B]/30 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#102343] border border-[#C6A65B] flex items-center justify-center font-editorial font-bold text-[#C6A65B] text-lg shadow-md">
          GH
        </div>
        <div>
          <h1 className="font-editorial text-sm font-bold tracking-wider text-[#C6A65B] uppercase">
            Parliament
          </h1>
          <p className="text-[11px] text-[#DFCA95] tracking-widest uppercase">
            Protocol & Events
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-[#DFCA95]/60">
          Operations
        </div>
        {navigationItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-medium transition-all ${
                isActive
                  ? "bg-[#C6A65B] text-[#0A1830] font-semibold shadow-sm"
                  : "text-[#F7F5F0]/80 hover:bg-[#102343] hover:text-[#DFCA95]"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? "text-[#0A1830]" : "text-[#C6A65B]"}`} />
                <span>{item.name}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                    isActive
                      ? "bg-[#0A1830] text-[#DFCA95]"
                      : "bg-[#C6A65B]/20 text-[#DFCA95] border border-[#C6A65B]/40"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}

        <div className="pt-4 px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-[#DFCA95]/60">
          Event-Day Portal
        </div>
        <Link
          href="/usher"
          target="_blank"
          className="flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-medium text-[#DFCA95] bg-[#102343] border border-[#C6A65B]/30 hover:bg-[#C6A65B]/20 transition-all"
        >
          <div className="flex items-center gap-3">
            <QrCode className="w-4 h-4 text-[#C6A65B]" />
            <span>Usher Scanner App</span>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-[#C6A65B]" />
        </Link>

        <div className="pt-4 px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-[#DFCA95]/60">
          Platform Governance
        </div>
        <Link
          href="/super-admin"
          className="flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-medium text-amber-300 bg-[#070D18] border border-amber-500/40 hover:bg-amber-500/10 transition-all"
        >
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>DakyXTech Console</span>
          </div>
          <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-500/30">
            Super Admin
          </span>
        </Link>
      </nav>

      {/* Footer / System Status */}
      <div className="p-4 border-t border-[#C6A65B]/20 bg-[#081326] text-[11px] text-[#DFCA95]/80">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-semibold text-white">Event Engine Online</span>
        </div>
        <p className="text-[10px] text-[#DFCA95]/60">CAROLS-2026 Baseline</p>
      </div>
    </aside>
  );
}

