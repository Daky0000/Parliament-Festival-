"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { QrCode, ShieldCheck, ExternalLink, ArrowRight } from "lucide-react";
import { navigationItems, type Viewer } from "./nav-items";

export function BrandMark({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`${className} flex-none rounded-full bg-brand-navy text-white grid place-items-center`}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-[55%] h-[55%]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 9.5 12 4l9 5.5" />
        <path d="M4.5 10h15" />
        <path d="M6.5 10v7.5M10 10v7.5M14 10v7.5M17.5 10v7.5" />
        <path d="M4 20h16" />
      </svg>
    </span>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // "/guests" should not light up on "/guests/import"
  return pathname === href;
}

export function Sidebar({ viewer }: { viewer: Viewer }) {
  const pathname = usePathname();

  return (
    <aside className="band hidden lg:flex w-[272px] flex-none flex-col sticky top-3 h-[calc(100vh-24px)]">
      <div className="dotfield dotfield-faint" aria-hidden="true" />

      <Link href="/" className="relative flex items-center gap-3 px-5 pt-5 pb-4 no-underline">
        <span className="w-10 h-10 flex-none rounded-full bg-white/10 text-white grid place-items-center">
          <svg
            viewBox="0 0 24 24"
            className="w-[22px] h-[22px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 9.5 12 4l9 5.5" />
            <path d="M4.5 10h15" />
            <path d="M6.5 10v7.5M10 10v7.5M14 10v7.5M17.5 10v7.5" />
            <path d="M4 20h16" />
          </svg>
        </span>
        <span className="flex flex-col leading-tight">
          <b className="font-medium text-[16px] tracking-[-0.01em] text-white">Parliament of Ghana</b>
          <span className="text-[12px] text-white/60">Event &amp; Protocol Platform</span>
        </span>
      </Link>

      <nav className="relative flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-1" aria-label="Dashboard">
        <span className="px-3 pt-3 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">
          Operations
        </span>
        {navigationItems.filter((item) => viewer.allowedHrefs.includes(item.href)).map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] transition-colors ${
                active
                  ? "bg-white text-brand-ink font-medium"
                  : "text-white/75 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              <Icon className={`w-[18px] h-[18px] flex-none ${active ? "text-brand-blue" : "text-brand-blueLight"}`} />
              <span className="flex-1 min-w-0 truncate">{item.name}</span>
              {item.badge && (
                <span
                  className={`text-[10px] font-medium uppercase tracking-[0.12em] px-2 py-0.5 rounded-[10px] ${
                    active ? "bg-brand-pale text-brand-blue" : "bg-white/10 text-brand-blueLight"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}

        <span className="px-3 pt-5 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">
          Event day &amp; governance
        </span>
        {viewer.canUsher && (
        <Link
          href="/usher"
          target="_blank"
          className="flex items-center gap-3 px-3 py-3 rounded-[14px] bg-white/[0.06] border border-white/[0.12] text-white hover:bg-white/[0.11] transition-colors"
        >
          <span className="w-9 h-9 flex-none rounded-[10px] bg-white/[0.08] grid place-items-center text-brand-blueLight">
            <QrCode className="w-[18px] h-[18px]" />
          </span>
          <span className="flex-1 min-w-0">
            <b className="block font-medium text-[14px]">Usher Scanner</b>
            <span className="block text-[12px] text-white/60">Check guests in at the door</span>
          </span>
          <ExternalLink className="w-4 h-4 text-brand-blueLight" />
        </Link>
        )}
        {viewer.canSuperAdmin && (
        <Link
          href="/super-admin"
          className="group flex items-center gap-3 px-3 py-3 rounded-[14px] bg-white/[0.06] border border-white/[0.12] text-white hover:bg-white/[0.11] transition-colors"
        >
          <span className="w-9 h-9 flex-none rounded-[10px] bg-white/[0.08] grid place-items-center text-brand-blueLight">
            <ShieldCheck className="w-[18px] h-[18px]" />
          </span>
          <span className="flex-1 min-w-0">
            <b className="block font-medium text-[14px]">Super Admin Console</b>
            <span className="block text-[12px] text-white/60">Providers, keys and settings</span>
          </span>
          <ArrowRight className="w-4 h-4 text-brand-blueLight transition-transform group-hover:translate-x-[3px]" />
        </Link>
        )}
      </nav>

      <div className="relative mx-3 mb-3 px-4 py-3 rounded-[14px] bg-white/[0.06] text-[12px]">
        <div className="flex items-center gap-2 text-white font-medium">
          <span className="w-[7px] h-[7px] rounded-full bg-[#A3E635]" aria-hidden="true" />
          Event engine online
        </div>
        <p className="text-white/55 mt-0.5">{viewer.event?.eventCode ?? "No event selected"}</p>
      </div>
    </aside>
  );
}
