"use client";

import { Calendar, MapPin, Search, ShieldCheck, User } from "lucide-react";

export function Topbar() {
  return (
    <header className="h-16 bg-white border-b border-[#E4E7EC] flex items-center justify-between px-6 z-10">
      {/* Event Context & Switcher */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-editorial font-bold text-sm text-[#102343]">
              2026 Festival of Nine Lessons and Carols
            </span>
            <span className="bg-[#102343] text-[#C6A65B] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Active Event
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#667085] mt-0.5">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#C6A65B]" />
              Friday, 18 Dec 2026 • 4:00 PM GMT
            </span>
            <span>&bull;</span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#C6A65B]" />
              Forecourt of Parliament House, Accra
            </span>
          </div>
        </div>
      </div>

      {/* Right User Bar */}
      <div className="flex items-center gap-4">
        {/* User Profile Pill */}
        <div className="flex items-center gap-3 pl-4 border-l border-[#E4E7EC]">
          <div className="w-8 h-8 rounded-full bg-[#102343] text-[#DFCA95] flex items-center justify-center font-bold text-xs border border-[#C6A65B]">
            KB
          </div>
          <div className="text-left hidden sm:block">
            <div className="text-xs font-semibold text-[#202A38]">
              Kwame Boateng
            </div>
            <div className="text-[10px] text-[#C6A65B] font-medium flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-[#18794E]" />
              Director of IT & Protocol
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

