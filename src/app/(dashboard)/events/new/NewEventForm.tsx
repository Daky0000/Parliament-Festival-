"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormError, buttonClass, inputClass, labelClass, postJson } from "@/components/auth/AuthShell";

// Accra is UTC+0 all year, so the local datetime-local value is sent as UTC.
const toIso = (v: string) => (v ? new Date(`${v}:00Z`).toISOString() : undefined);

export function NewEventForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "2026 Festival of Nine Lessons and Carols",
    eventCode: "CAROLS-2026",
    venueName: "Forecourt of Parliament of Ghana",
    venueAddress: "Parliament House, Osu, Accra, Ghana",
    startsAt: "2026-12-18T16:00",
    endsAt: "2026-12-18T20:30",
    rsvpDeadline: "2026-12-10T18:00",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === "eventCode" ? e.target.value.toUpperCase() : e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await postJson<{ data: { id: string } }>("/api/v1/events", {
        name: form.name,
        eventCode: form.eventCode,
        venueName: form.venueName || undefined,
        venueAddress: form.venueAddress || undefined,
        startsAt: toIso(form.startsAt),
        endsAt: toIso(form.endsAt),
        rsvpDeadline: toIso(form.rsvpDeadline),
      });
      await postJson("/api/auth/event", { eventId: data.id });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const field = (k: keyof typeof form, label: string, type = "text", extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={k} className={labelClass}>{label}</label>
      <input id={k} type={type} className={inputClass} value={form[k]} onChange={set(k)} {...extra} />
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {field("name", "Event name", "text", { required: true, minLength: 3, maxLength: 200 })}
      {field("eventCode", "Event code (capital letters, digits, dashes)", "text", { required: true, pattern: "[A-Z0-9-]{3,32}" })}
      {field("venueName", "Venue")}
      {field("venueAddress", "Venue address")}
      <div className="grid gap-4 sm:grid-cols-3">
        {field("startsAt", "Starts (Accra time)", "datetime-local")}
        {field("endsAt", "Ends (Accra time)", "datetime-local")}
        {field("rsvpDeadline", "RSVP deadline", "datetime-local")}
      </div>
      <FormError message={error} />
      <button type="submit" className={buttonClass} disabled={busy}>
        {busy ? "Creating…" : "Create event"}
      </button>
    </form>
  );
}
