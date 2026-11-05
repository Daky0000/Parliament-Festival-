"use client";

import { useEffect, useState } from "react";

type Summary = {
  invited: number;
  checkedIn: number;
  notYetArrived: number;
  rsvp: { accepted: number; declined: number; pending: number };
  byGate: { gate: string; count: number }[];
  byCategory: { category: string; count: number }[];
  attempts: Record<string, number>;
  overrides: number;
  recent: { id: string; guest: string; category: string | null; gate: string | null; by: string | null; at: string; method: string; status: string }[];
};

const LABELS: Record<string, string> = {
  already_checked_in: "Duplicate scans",
  invalid: "Invalid passes",
  expired: "Expired passes",
  revoked: "Revoked passes",
  rsvp_declined: "Declined guests",
  wrong_gate: "Wrong gate",
  unauthorized: "Unauthorized",
  event_not_active: "Outside check-in window",
};

/** Live check-in operations view, refreshed every 5 seconds. */
export function LiveOps({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch(`/api/v1/attendance/summary?eventId=${encodeURIComponent(eventId)}`).catch(() => null);
      if (!alive) return;
      if (res?.ok) {
        setData((await res.json()).data);
        setError(null);
      } else setError("Live data unavailable — retrying.");
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [eventId]);

  if (!data) return <div className="panel p-6 text-brand-muted">{error ?? "Loading live check-in data…"}</div>;
  const pct = data.invited ? Math.round((data.checkedIn / data.invited) * 100) : 0;
  const issues = Object.entries(data.attempts).filter(([k, n]) => k !== "checked_in" && n > 0);

  return (
    <section className="panel p-6 space-y-5" aria-label="Live check-in operations">
      <div className="flex items-center justify-between">
        <h3 className="text-[18px] font-medium text-brand-ink">Live check-in</h3>
        <span className="chip"><span className="pip" />Updates every 5 s</span>
      </div>
      {error && <p className="text-[13px] text-[#B54708]">{error}</p>}
      <dl className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Checked in", `${data.checkedIn} (${pct}%)`],
          ["Not yet arrived", data.notYetArrived],
          ["RSVP accepted", data.rsvp.accepted],
          ["RSVP declined / pending", `${data.rsvp.declined} / ${data.rsvp.pending}`],
          ["Overrides & reversals", data.overrides],
        ].map(([k, v]) => (
          <div key={String(k)} className="bg-[#F6F7F9] rounded-[10px] p-3">
            <dt className="text-[12px] text-brand-muted">{k}</dt>
            <dd className="text-[20px] font-medium text-brand-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="grid md:grid-cols-3 gap-4 text-[14px]">
        <div>
          <h4 className="font-medium text-brand-ink mb-2">By gate</h4>
          <ul className="space-y-1">{data.byGate.map((g) => <li key={g.gate} className="flex justify-between"><span>{g.gate}</span><strong>{g.count}</strong></li>)}</ul>
        </div>
        <div>
          <h4 className="font-medium text-brand-ink mb-2">By category</h4>
          <ul className="space-y-1">{data.byCategory.map((c) => <li key={c.category} className="flex justify-between"><span>{c.category}</span><strong>{c.count}</strong></li>)}</ul>
        </div>
        <div>
          <h4 className="font-medium text-brand-ink mb-2">Exceptions (last 12 h)</h4>
          {issues.length === 0 ? <p className="text-brand-muted">None</p> : (
            <ul className="space-y-1">{issues.map(([k, n]) => <li key={k} className="flex justify-between"><span>{LABELS[k] ?? k}</span><strong>{n}</strong></li>)}</ul>
          )}
        </div>
      </div>
      <div>
        <h4 className="font-medium text-brand-ink mb-2 text-[14px]">Recent check-ins</h4>
        <ul className="divide-y divide-brand-line text-[14px]">
          {data.recent.map((r) => (
            <li key={r.id} className="py-2 flex flex-wrap justify-between gap-2">
              <span>
                <strong>{r.guest}</strong>{r.category ? ` · ${r.category}` : ""}
                {r.status === "reversed" && <span className="ml-2 text-[#B42318]">(reversed)</span>}
                {r.method === "supervisor_override" && <span className="ml-2 text-[#B54708]">(override)</span>}
              </span>
              <span className="text-brand-muted">
                {new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                {r.gate ? ` · ${r.gate}` : ""}{r.by ? ` · ${r.by}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
