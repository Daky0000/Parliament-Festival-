"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Calendar, MapPin, Menu, X, LogOut } from "lucide-react";
import { navigationItems, type Viewer } from "./nav-items";
import { BrandMark } from "./Sidebar";

function initials(name: string) {
  return name.replace(/(.*)/, "").trim().split(/s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function formatStart(iso: string | null) {
  if (!iso) return "Date to be confirmed";
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "long", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "Africa/Accra", timeZoneName: "short",
  });
}

export function Topbar({ viewer }: { viewer: Viewer }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const items = navigationItems.filter((item) => viewer.allowedHrefs.includes(item.href));

  async function switchEvent(eventId: string) {
    await fetch("/api/auth/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    });
    router.refresh();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="panel">
      <div className="flex items-center gap-4 px-4 sm:px-6 py-4">
        <span className="lg:hidden">
          <BrandMark />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {viewer.events.length > 1 ? (
              <select
                aria-label="Current event"
                className="text-[16px] sm:text-[17px] font-medium tracking-[-0.02em] text-brand-ink bg-transparent border border-brand-line2 rounded-[10px] px-2 py-1"
                value={viewer.event?.id ?? ""}
                onChange={(e) => switchEvent(e.target.value)}
              >
                {viewer.events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            ) : (
              <span className="text-[16px] sm:text-[17px] font-medium tracking-[-0.02em] text-brand-ink truncate">
                {viewer.event?.name ?? "No event assigned"}
              </span>
            )}
            <span className="chip">
              <span className="pip" />
              Active event
            </span>
          </div>
          <div className="hidden sm:flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-brand-muted mt-1">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-brand-blue" />
              {formatStart(viewer.event?.startsAt ?? null)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-brand-blue" />
              {viewer.event?.venueName ?? "Venue to be confirmed"}
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 pl-4 border-l border-brand-line">
          <span className="w-9 h-9 rounded-full bg-brand-navy text-white grid place-items-center text-[13px] font-medium">
            {initials(viewer.fullName)}
          </span>
          <span className="flex flex-col leading-tight">
            <Link href="/account" className="text-[14px] font-medium text-brand-ink no-underline hover:underline">{viewer.fullName}</Link>
            <span className="text-[12px] text-brand-muted">{viewer.roleLabel}</span>
          </span>
          <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out"
            className="w-9 h-9 grid place-items-center rounded-[10px] border border-brand-line2 text-brand-ink hover:bg-brand-soft">
            <LogOut className="w-4 h-4" />
          </button>
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
          {items.map((item) => {
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
                {viewer.hiddenHrefs.includes(item.href) && (
                  <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.12em] px-2 py-0.5 rounded-[10px] bg-brand-soft text-brand-muted border border-brand-line">
                    Hidden
                  </span>
                )}
              </Link>
            );
          })}
          {viewer.canUsher && (
            <Link href="/usher" target="_blank" className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] text-brand-ink hover:bg-brand-soft">
              Usher Scanner
            </Link>
          )}
          {viewer.canSuperAdmin && (
            <Link href="/super-admin" className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] text-brand-ink hover:bg-brand-soft">
              Super Admin Console
            </Link>
          )}
          <Link href="/account" className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] text-brand-ink hover:bg-brand-soft">
            My account
          </Link>
          <button type="button" onClick={signOut} className="text-left flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] text-brand-ink hover:bg-brand-soft">
            Sign out
          </button>
        </nav>
      )}
    </header>
  );
}
