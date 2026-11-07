"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

type Item = { name: string; href: string };

const btn = "px-3 py-2 rounded-[10px] text-[13px] font-medium border border-white/[0.14] hover:bg-white/[0.08] disabled:opacity-50 transition-colors";

export function NavigationClientView({ items, initialHidden }: { items: Item[]; initialHidden: string[] }) {
  const [saved, setSaved] = useState<string[]>(initialHidden);
  const [hidden, setHidden] = useState<string[]>(initialHidden);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = hidden.length !== saved.length || hidden.some((h) => !saved.includes(h));

  function toggle(href: string) {
    setNotice(null);
    setHidden((prev) => (prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href]));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/super-admin/navigation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenHrefs: hidden }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save menu visibility");
      setSaved(data.data.hiddenHrefs);
      setHidden(data.data.hiddenHrefs);
      setNotice("Saved. Users see the change the next time they load a page.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save menu visibility");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-editorial text-2xl font-medium text-white">Menu visibility</h2>
        <p className="text-xs text-white/60 mt-1">
          Hide dashboard menu items from every user. Super admins still see hidden items, marked &ldquo;Hidden&rdquo;.
          Hiding removes the menu link only: the page itself still follows each user&rsquo;s role permissions.
          Every change is audited.
        </p>
      </div>

      {error && <p role="alert" className="text-[14px] text-[#FDA29B] bg-[#55160C]/40 rounded-[10px] px-3 py-2">{error}</p>}
      {notice && (
        <p role="status" className="text-[14px] text-[#A6F4C5] bg-[#053321]/40 border border-[#A6F4C5]/30 rounded-[10px] px-3.5 py-2.5">
          {notice}
        </p>
      )}

      <ul className="band divide-y divide-white/[0.08]">
        {items.map((item) => {
          const isHidden = hidden.includes(item.href);
          return (
            <li key={item.href} className="relative flex items-center gap-4 px-5 py-3.5">
              <div className="flex-1 min-w-0">
                <div className={`text-[14px] font-medium ${isHidden ? "text-white/50" : "text-white"}`}>{item.name}</div>
                <div className="text-[12px] text-white/45">{item.href}</div>
              </div>
              <span className={`text-[12px] ${isHidden ? "text-[#FEDF89]" : "text-[#A6F4C5]"}`}>
                {isHidden ? "Hidden" : "Visible"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={!isHidden}
                aria-label={`Show ${item.name} in the menu`}
                onClick={() => toggle(item.href)}
                className={`${btn} inline-flex items-center gap-2 min-w-[96px] justify-center`}
              >
                {isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {isHidden ? "Show" : "Hide"}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className={`${btn} bg-[#2E5BFF] border-[#2E5BFF] hover:bg-[#2448cc] inline-flex items-center gap-2`}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Save changes
        </button>
        {dirty && (
          <button type="button" onClick={() => setHidden(saved)} disabled={busy} className={btn}>
            Discard
          </button>
        )}
      </div>
    </div>
  );
}
