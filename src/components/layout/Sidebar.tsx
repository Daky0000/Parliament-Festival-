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
    <aside className="panel dot-surface dots-bottom hidden lg:flex w-[272px] flex-none flex-col sticky top-3 h-[calc(100vh-24px)]">

      <Link href="/" className="relative flex items-center gap-3 px-5 pt-5 pb-4 no-underline">
        <span className="w-10 h-10 flex-none rounded-full bg-brand-navy text-white grid place-items-center">
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
          <b className="font-medium text-[16px] tracking-[-0.01em] text-brand-ink">Parliament of Ghana</b>
          <span className="text-[12px] text-brand-muted">Event &amp; Protocol Platform</span>
        </span>
      </Link>

      <nav className="relative flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-1" aria-label="Dashboard">
        <span className="px-3 pt-3 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-faint">
          Operations
        </span>
        {navigationItems.filter((item) => viewer.allowedHrefs.includes(item.href)).map((item) => {
          const active = isActive(pathname, item.href);
          const hidden = viewer.hiddenHrefs.includes(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={hidden ? "Hidden from other users. Only super admins see this item." : undefined}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] transition-colors ${
                active
                  ? "bg-brand-navy text-white font-medium"
                  : "text-brand-ink/80 hover:bg-brand-soft hover:text-brand-ink"
              } ${hidden && !active ? "opacity-60" : ""}`}
            >
              <Icon className={`w-[18px] h-[18px] flex-none ${active ? "text-brand-blueLight" : "text-brand-blue"}`} />
              <span className="flex-1 min-w-0 truncate">{item.name}</span>
              {hidden && (
                <span
                  className={`text-[10px] font-medium uppercase tracking-[0.12em] px-2 py-0.5 rounded-[10px] ${
                    active ? "bg-white/15 text-white" : "bg-brand-soft text-brand-muted border border-brand-line"
                  }`}
                >
                  Hidden
                </span>
              )}
              {item.badge && (
                <span
                  className={`text-[10px] font-medium uppercase tracking-[0.12em] px-2 py-0.5 rounded-[10px] ${
                    active ? "bg-white/15 text-white" : "bg-brand-pale text-brand-blue"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}

        <span className="px-3 pt-5 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-faint">
          Event day &amp; governance
        </span>
        {viewer.canUsher && (
        <Link
          href="/usher"
          target="_blank"
          className="flex items-center gap-3 px-3 py-3 rounded-[14px] bg-brand-soft border border-brand-line text-brand-ink hover:bg-brand-line transition-colors"
        >
          <span className="w-9 h-9 flex-none rounded-[10px] bg-white grid place-items-center text-brand-blue">
            <QrCode className="w-[18px] h-[18px]" />
          </span>
          <span className="flex-1 min-w-0">
            <b className="block font-medium text-[14px]">Usher Scanner</b>
            <span className="block text-[12px] text-brand-muted">Check guests in at the door</span>
          </span>
          <ExternalLink className="w-4 h-4 text-brand-blue" />
        </Link>
        )}
        {viewer.canSuperAdmin && (
        <Link
          href="/super-admin"
          className="group flex items-center gap-3 px-3 py-3 rounded-[14px] bg-brand-soft border border-brand-line text-brand-ink hover:bg-brand-line transition-colors"
        >
          <span className="w-9 h-9 flex-none rounded-[10px] bg-white grid place-items-center text-brand-blue">
            <ShieldCheck className="w-[18px] h-[18px]" />
          </span>
          <span className="flex-1 min-w-0">
            <b className="block font-medium text-[14px]">Super Admin Console</b>
            <span className="block text-[12px] text-brand-muted">Providers, keys and settings</span>
          </span>
          <ArrowRight className="w-4 h-4 text-brand-blue transition-transform group-hover:translate-x-[3px]" />
        </Link>
        )}
      </nav>

      <div className="relative mx-3 mb-3 px-4 py-3 rounded-[14px] bg-brand-soft text-[12px]">
        <div className="flex items-center gap-2 text-brand-ink font-medium">
          <span className="w-[7px] h-[7px] rounded-full bg-[#65A30D]" aria-hidden="true" />
          Event engine online
        </div>
        <p className="text-brand-muted mt-0.5">{viewer.event?.eventCode ?? "No event selected"}</p>
      </div>
    </aside>
  );
}
