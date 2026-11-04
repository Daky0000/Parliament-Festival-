"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, MapPin, Menu, X } from "lucide-react";
import { navigationItems } from "./nav-items";
import { BrandMark } from "./Sidebar";

export function Topbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="panel">
      <div className="flex items-center gap-4 px-4 sm:px-6 py-4">
        <span className="lg:hidden">
          <BrandMark />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[16px] sm:text-[17px] font-medium tracking-[-0.02em] text-brand-ink truncate">
              2026 Festival of Nine Lessons and Carols
            </span>
            <span className="chip">
              <span className="pip" />
              Active event
            </span>
          </div>
          <div className="hidden sm:flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-brand-muted mt-1">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-brand-blue" />
              Friday, 18 Dec 2026 · 4:00 PM GMT
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-brand-blue" />
              Forecourt of Parliament House, Accra
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 pl-4 border-l border-brand-line">
          <span className="w-9 h-9 rounded-full bg-brand-navy text-white grid place-items-center text-[13px] font-medium">
            KB
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[14px] font-medium text-brand-ink">Kwame Boateng</span>
            <span className="text-[12px] text-brand-muted">Director of IT &amp; Protocol</span>
          </span>
        </div>

        <button
          type="button"
          className="lg:hidden w-11 h-11 grid place-items-center rounded-[10px] border border-brand-line2 text-brand-ink"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {open && (
        <nav id="mobile-nav" className="lg:hidden border-t border-brand-line px-3 py-3 grid gap-1" aria-label="Dashboard">
          {navigationItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] ${
                  active ? "bg-brand-pale text-brand-blue font-medium" : "text-brand-ink hover:bg-brand-soft"
                }`}
              >
                <Icon className="w-[18px] h-[18px] text-brand-blue" />
                {item.name}
              </Link>
            );
          })}
          <Link href="/usher" target="_blank" className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] text-brand-ink hover:bg-brand-soft">
            Usher Scanner
          </Link>
          <Link href="/super-admin" className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] text-brand-ink hover:bg-brand-soft">
            Super Admin Console
          </Link>
        </nav>
      )}
    </header>
  );
}
