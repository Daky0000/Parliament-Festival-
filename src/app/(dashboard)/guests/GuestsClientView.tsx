"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Plus,
  Filter,
  CheckCircle,
  Clock,
  XCircle,
  Armchair,
  Mail,
  Phone,
  Eye,
  Building2,
  Award,
  ShieldCheck,
  QrCode,
  Sparkles,
  Send,
  MailOpen,
  MailX,
  RefreshCw,
  MousePointerClick,
  Loader2,
} from "lucide-react";
import { TemplatePreviewModal } from "@/components/templates/TemplatePreviewModal";
import { TemplateData } from "@/components/templates/PassTemplate";
import { GuestDetailDrawer } from "./GuestDetailDrawer";
import { DESIGNATION_GROUPS, OTHER_DESIGNATION } from "@/lib/designations";
import type { EmailTracking } from "@/lib/email/tracking-summary";

interface GuestItem {
  id: string;
  guestReference: string | null;
  companionAllowance: number;
  emailTracking?: EmailTracking;
  person: {
    title: string | null;
    fullName: string;
    designation: string | null;
    email: string | null;
    phone: string | null;
  };
  protocolCategory: {
    id: string;
    name: string;
    rankOrder: number;
    colourHex: string;
  } | null;
  institution: {
    name: string;
  } | null;
  invitations: Array<{
    invitationReference: string;
    invitationStatus: string;
    rsvps: Array<{
      response: string;
      companionCount: number;
    }>;
  }>;
  seatAssignments: Array<{
    section: { name: string; colourHex: string | null };
    seat: { seatCode: string } | null;
  }>;
}

interface CategoryItem {
  id: string;
  name: string;
  rankOrder: number;
  colourHex: string;
}

interface SeatingSectionItem {
  id: string;
  sectionCode: string;
  name: string;
  protocolCategoryId: string | null;
  seats?: Array<{ id: string; seatCode: string }>;
}

const HONORIFIC_TITLES = [
  "Hon.",
  "Rt. Hon.",
  "H.E.",
  "Dr.",
  "Prof.",
  "Amb.",
  "Rev.",
  "Most Rev.",
  "Nana",
  "Togbe",
  "Lt. Gen.",
  "Maj. Gen.",
  "Mr.",
  "Mrs.",
  "Ms.",
];

const EMPTY_TRACKING: EmailTracking = {
  status: "not_sent",
  lastSentAt: null,
  sendCount: 0,
  firstOpenedAt: null,
  lastOpenedAt: null,
  openCount: 0,
  clicked: false,
  visitedRsvpPage: false,
  lastError: null,
};

const POLL_MS = 30_000;

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - +d) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatEventDate(iso: string | null | undefined) {
  if (!iso) return { date: undefined, time: undefined };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Accra" }),
    time: `${d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Accra" }).toUpperCase()} GMT`,
  };
}

function EmailStatus({ t }: { t: EmailTracking }) {
  const base = "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[10px] text-[10.5px] font-medium";
  switch (t.status) {
    case "clicked":
    case "opened":
      return (
        <div>
          <span className={`${base} bg-brand-positiveBg text-brand-positive`}>
            {t.status === "clicked" ? <MousePointerClick className="w-3 h-3" /> : <MailOpen className="w-3 h-3" />}
            {t.status === "clicked" ? "Opened · RSVP link used" : `Opened${t.openCount > 1 ? ` ${t.openCount}×` : ""}`}
          </span>
          <div className="text-[10.5px] text-brand-muted mt-0.5" title={t.firstOpenedAt ? new Date(t.firstOpenedAt).toLocaleString() : ""}>
            First opened {when(t.firstOpenedAt)}
            {t.lastOpenedAt && t.lastOpenedAt !== t.firstOpenedAt ? ` · last ${when(t.lastOpenedAt)}` : ""}
          </div>
        </div>
      );
    case "delivered":
    case "sent":
      return (
        <div>
          <span className={`${base} bg-brand-pale text-brand-blue`}>
            <Mail className="w-3 h-3" />
            {t.status === "delivered" ? "Delivered · not opened" : "Sent · not opened"}
          </span>
          <div className="text-[10.5px] text-brand-muted mt-0.5">Sent {when(t.lastSentAt)}</div>
        </div>
      );
    case "bounced":
      return (
        <span className={`${base} bg-brand-dangerBg text-brand-danger`}>
          <MailX className="w-3 h-3" />
          Bounced
        </span>
      );
    case "failed":
      return (
        <span className={`${base} bg-brand-dangerBg text-brand-danger`} title={t.lastError ?? ""}>
          <MailX className="w-3 h-3" />
          Send failed
        </span>
      );
    default:
      return <span className="text-[11px] text-brand-muted italic">Not sent</span>;
  }
}

export function GuestsClientView({
  eventId,
  initialGuests,
  categories,
  seatingSections = [],
  canSendEmail = false,
  eventName,
  eventVenue,
  eventStartsAt,
}: {
  eventId: string;
  initialGuests: any[];
  categories: CategoryItem[];
  seatingSections?: SeatingSectionItem[];
  canSendEmail?: boolean;
  eventName?: string;
  eventVenue?: string | null;
  eventStartsAt?: string | null;
}) {
  const [guests, setGuests] = useState<GuestItem[]>(initialGuests);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedRsvp, setSelectedRsvp] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedEmail, setSelectedEmail] = useState("all");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [confirmGuest, setConfirmGuest] = useState<GuestItem | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [detailGuestId, setDetailGuestId] = useState<string | null>(null);
  const [detailReload, setDetailReload] = useState(0);

  // Template Preview Modal
  const [previewGuestId, setPreviewGuestId] = useState<string | undefined>(undefined);
  const [previewData, setPreviewData] = useState<TemplateData | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    title: "Hon.",
    fullName: "",
    designation: "",
    customDesignation: "",
    company: "",
    email: "",
    phone: "",
    protocolCategoryId: categories[0]?.id || "",
    sectionId: "",
    companionAllowance: 1,
    operationalNotes: "",
  });

  const trackingOf = (g: GuestItem) => g.emailTracking ?? EMPTY_TRACKING;

  // Live email tracking: poll while the page is visible, so opens appear without a reload.
  const refreshTracking = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/v1/email-tracking?eventId=${encodeURIComponent(eventId)}`);
      if (!res.ok) return;
      const { data } = (await res.json()) as { data: Record<string, EmailTracking> };
      setGuests((prev) => prev.map((g) => (data[g.id] ? { ...g, emailTracking: data[g.id] } : g)));
    } catch {
      /* offline: keep the last known state */
    } finally {
      setRefreshing(false);
    }
  }, [eventId]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refreshTracking();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refreshTracking]);

  const sendEmail = async (guest: GuestItem) => {
    setConfirmGuest(null);
    setSendingId(guest.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/guests/${guest.id}/send-invitation`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (body.tracking || body.data?.tracking) {
        const t = (body.data?.tracking ?? body.tracking) as EmailTracking;
        setGuests((prev) => prev.map((g) => (g.id === guest.id ? { ...g, emailTracking: t } : g)));
      }
      setDetailReload((n) => n + 1);
      if (res.ok) {
        setNotice({ kind: "ok", text: `Invitation sent to ${guest.person.fullName} (${body.data.sentTo}). You will see here when it is opened.` });
      } else {
        setNotice({ kind: "error", text: body.error || "The email could not be sent." });
      }
    } catch {
      setNotice({ kind: "error", text: "Network error while sending the email." });
    } finally {
      setSendingId(null);
    }
  };

  const emailCounts = guests.reduce(
    (acc, g) => {
      const t = trackingOf(g);
      if (t.status === "opened" || t.status === "clicked") acc.opened++;
      else if (t.status === "sent" || t.status === "delivered") acc.unopened++;
      else if (t.status === "failed" || t.status === "bounced") acc.failed++;
      else acc.notSent++;
      return acc;
    },
    { opened: 0, unopened: 0, failed: 0, notSent: 0 }
  );

  const filteredGuests = guests.filter((g) => {
    const matchesSearch =
      searchQuery === "" ||
      g.person.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.institution?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.person.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.person.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.guestReference?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" || g.protocolCategory?.id === selectedCategory;

    const latestRsvp = g.invitations?.[0]?.rsvps?.[0]?.response || "pending";
    const matchesRsvp = selectedRsvp === "all" || latestRsvp === selectedRsvp;

    const t = trackingOf(g).status;
    const matchesEmail =
      selectedEmail === "all" ||
      (selectedEmail === "opened" && (t === "opened" || t === "clicked")) ||
      (selectedEmail === "unopened" && (t === "sent" || t === "delivered")) ||
      (selectedEmail === "failed" && (t === "failed" || t === "bounced")) ||
      (selectedEmail === "not_sent" && t === "not_sent");

    return matchesSearch && matchesCategory && matchesRsvp && matchesEmail;
  });

  // The seat follows the rank: the section is matched from the category on save.
  const handleCategorySelect = (categoryId: string) => {
    setFormData((prev) => ({ ...prev, protocolCategoryId: categoryId }));
  };

  const autoSection =
    seatingSections.find((s) => s.id === formData.sectionId) ||
    seatingSections.find((s) => s.protocolCategoryId === formData.protocolCategoryId) ||
    seatingSections[0];

  const resolvedDesignation =
    formData.designation === OTHER_DESIGNATION ? formData.customDesignation.trim() : formData.designation;

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName.trim()) {
      setErrorMessage("Full name is required.");
      return;
    }
    if (!formData.company.trim()) {
      setErrorMessage("Company / Institution is required.");
      return;
    }
    if (!formData.designation) {
      setErrorMessage("Please select a designation.");
      return;
    }
    if (formData.designation === OTHER_DESIGNATION && !formData.customDesignation.trim()) {
      setErrorMessage("Please type the custom designation.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/v1/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          title: formData.title,
          fullName: formData.fullName.trim(),
          designation: resolvedDesignation,
          company: formData.company.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          protocolCategoryId: formData.protocolCategoryId,
          sectionId: formData.sectionId || undefined,
          companionAllowance: formData.companionAllowance,
          operationalNotes: formData.operationalNotes,
        }),
      });

      const data = await res.json();
      if (res.ok && data.data) {
        const createdGuest: GuestItem = {
          ...data.data,
          invitations: data.data.invitations || [],
          seatAssignments: data.data.seatAssignments || [],
        };

        setGuests([createdGuest, ...guests]);
        setIsModalOpen(false);
        const seat = createdGuest.seatAssignments?.[0];
        setNotice({
          kind: "ok",
          text: `${createdGuest.person.fullName} added. Reference ${createdGuest.guestReference}${
            seat
              ? ` · ${seat.section.name}${seat.seat ? ` · Seat ${seat.seat.seatCode}` : ""}`
              : seatingSections.length
                ? ". The section for this rank is full, so no seat was allocated; assign one in the Seating Planner"
                : ""
          }.`,
        });

        // Reset form
        setFormData({
          title: "Hon.",
          fullName: "",
          designation: "",
          customDesignation: "",
          company: "",
          email: "",
          phone: "",
          protocolCategoryId: categories[0]?.id || "",
          sectionId: "",
          companionAllowance: 1,
          operationalNotes: "",
        });
      } else {
        setErrorMessage(data.error || "Failed to add dignitary");
      }
    } catch (err) {
      console.error("Error creating guest:", err);
      setErrorMessage("Network error while adding dignitary.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenPreview = (guest: GuestItem) => {
    const seatAssign = guest.seatAssignments?.[0];
    const cat = guest.protocolCategory;

    const { date, time } = formatEventDate(eventStartsAt);
    setPreviewData({
      guestTitle: guest.person.title,
      fullName: guest.person.fullName,
      designation: guest.person.designation,
      company: guest.institution?.name || "",
      rankName: cat?.name || "",
      rankOrder: cat?.rankOrder ?? 0,
      rankColourHex: cat?.colourHex,
      seatReference: seatAssign?.seat?.seatCode || null,
      sectionName: seatAssign?.section?.name || null,
      invitationReference: guest.invitations?.[0]?.invitationReference || guest.guestReference || undefined,
      guestReference: guest.guestReference,
      companionAllowance: guest.companionAllowance,
      eventName,
      eventVenue: eventVenue || undefined,
      eventDate: date,
      eventTime: time,
    });
    setPreviewGuestId(seatAssign ? guest.id : undefined);
    setIsPreviewOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#E3E6EB] flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-[#5B6374] absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by name, company, email, phone, or ref..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-[#E3E6EB] rounded-lg focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs border border-[#E3E6EB] rounded-lg px-3 py-2 bg-white text-[#0D1526] focus:outline-none focus:border-[#2563EB]"
          >
            <option value="all">All Protocol Ranks ({categories.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                Rank {c.rankOrder}: {c.name.slice(0, 35)}...
              </option>
            ))}
          </select>

          <select
            value={selectedRsvp}
            onChange={(e) => setSelectedRsvp(e.target.value)}
            className="text-xs border border-[#E3E6EB] rounded-lg px-3 py-2 bg-white text-[#0D1526] focus:outline-none focus:border-[#2563EB]"
          >
            <option value="all">All RSVP Responses</option>
            <option value="accepted">Accepted / Confirmed</option>
            <option value="declined">Declined</option>
            <option value="pending">Pending Response</option>
          </select>

          <select
            value={selectedEmail}
            onChange={(e) => setSelectedEmail(e.target.value)}
            className="text-xs border border-[#E3E6EB] rounded-lg px-3 py-2 bg-white text-[#0D1526] focus:outline-none focus:border-[#2563EB]"
            aria-label="Filter by email status"
          >
            <option value="all">All Email Statuses</option>
            <option value="opened">Opened ({emailCounts.opened})</option>
            <option value="unopened">Sent, not opened ({emailCounts.unopened})</option>
            <option value="failed">Failed / bounced ({emailCounts.failed})</option>
            <option value="not_sent">Not sent ({emailCounts.notSent})</option>
          </select>
        </div>

        {/* Prominent High-Contrast Add Dignitary Button */}
        <button
          onClick={() => {
            setErrorMessage(null);
            setIsModalOpen(true);
          }}
          className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Dignitary</span>
        </button>
      </div>

      {/* Email tracking at a glance */}
      <div className="bg-white px-4 py-3 rounded-xl border border-[#E3E6EB] flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="cap !text-[11px]">Invitation emails</span>
        <button onClick={() => setSelectedEmail("opened")} className="flex items-center gap-1.5 text-brand-positive font-medium hover:underline">
          <MailOpen className="w-3.5 h-3.5" /> {emailCounts.opened} opened
        </button>
        <button onClick={() => setSelectedEmail("unopened")} className="flex items-center gap-1.5 text-brand-blue font-medium hover:underline">
          <Mail className="w-3.5 h-3.5" /> {emailCounts.unopened} not opened yet
        </button>
        {emailCounts.failed > 0 && (
          <button onClick={() => setSelectedEmail("failed")} className="flex items-center gap-1.5 text-brand-danger font-medium hover:underline">
            <MailX className="w-3.5 h-3.5" /> {emailCounts.failed} failed
          </button>
        )}
        <button onClick={() => setSelectedEmail("not_sent")} className="flex items-center gap-1.5 text-brand-muted hover:underline">
          {emailCounts.notSent} not sent
        </button>
        <button
          onClick={refreshTracking}
          className="ml-auto flex items-center gap-1.5 text-brand-muted hover:text-brand-ink"
          title="Opens update automatically every 30 seconds"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Live · refresh
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className={`px-4 py-3 rounded-xl text-xs flex items-start justify-between gap-3 ${
            notice.kind === "ok" ? "bg-brand-positiveBg text-brand-positive" : "bg-brand-dangerBg text-brand-danger"
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="font-semibold">✕</button>
        </div>
      )}

      {/* Responsive Table */}
      <div className="bg-white rounded-xl border border-[#E3E6EB] overflow-hidden shadow-sm">
        <div className="table-responsive-container">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#F6F7F9] text-[#5B6374] border-b border-[#E3E6EB]">
              <tr>
                <th className="p-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5B6374]">
                  Dignitary &amp; Company
                </th>
                <th className="p-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5B6374]">
                  Protocol Rank
                </th>
                <th className="p-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5B6374]">
                  Contact (Email &amp; SMS)
                </th>
                <th className="p-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5B6374]">
                  RSVP Status
                </th>
                <th className="p-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5B6374]">
                  Seat Reference
                </th>
                <th className="p-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5B6374]">
                  Invitation Email
                </th>
                <th className="p-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5B6374] text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E6EB] text-xs">
              {filteredGuests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[#5B6374]">
                    No dignitaries match the current filters. Click &quot;Add Dignitary&quot; to register a guest.
                  </td>
                </tr>
              ) : (
                filteredGuests.map((guest) => {
                  const latestRsvp = guest.invitations?.[0]?.rsvps?.[0];
                  const seatAssignment = guest.seatAssignments?.[0];

                  return (
                    <tr key={guest.id} className="hover:bg-[#F6F7F9]/70 transition-colors">
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => setDetailGuestId(guest.id)}
                          className="font-semibold text-[#091833] text-left hover:text-brand-blue hover:underline underline-offset-2"
                          title="See this dignitary's details and email history"
                        >
                          {guest.person.title && !guest.person.fullName.startsWith(guest.person.title) ? `${guest.person.title} ` : ""}
                          {guest.person.fullName}
                        </button>
                        <div className="text-[11px] text-[#5B6374] mt-0.5">
                          {guest.person.designation && <span>{guest.person.designation} &bull; </span>}
                          <strong className="text-[#091833]">{guest.institution?.name || "General Dignitary"}</strong>
                        </div>
                      </td>

                      <td className="p-3">
                        {guest.protocolCategory ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: guest.protocolCategory.colourHex }}
                            />
                            <span className="font-semibold text-[#0D1526]">
                              Rank {guest.protocolCategory.rankOrder}
                            </span>
                            <span className="text-[11px] text-[#5B6374] hidden md:inline truncate max-w-[120px]">
                              ({guest.protocolCategory.name})
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#B42318] italic font-medium">Unranked</span>
                        )}
                      </td>

                      <td className="p-3 text-[11px]">
                        <div className="flex items-center gap-1 font-mono text-[#091833]">
                          <Mail className="w-3 h-3 text-[#2563EB]" />
                          <span>{guest.person.email || "No email"}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[#5B6374] mt-0.5">
                          <Phone className="w-3 h-3 text-emerald-600" />
                          <span>{guest.person.phone || "No phone"}</span>
                        </div>
                      </td>

                      <td className="p-3">
                        {latestRsvp?.response === "accepted" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#EEF6DC] text-[#3F6212]">
                            <CheckCircle className="w-3 h-3 text-[#3F6212]" />
                            Confirmed (+{latestRsvp.companionCount})
                          </span>
                        ) : latestRsvp?.response === "declined" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#FDECEA] text-[#B42318]">
                            <XCircle className="w-3 h-3 text-[#B42318]" />
                            Declined
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Pending Response
                          </span>
                        )}
                      </td>

                      <td className="p-3">
                        {seatAssignment ? (
                          <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#091833]">
                            <Armchair className="w-3.5 h-3.5 text-[#2563EB]" />
                            <span>
                              {seatAssignment.seat?.seatCode || seatAssignment.section.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#5B6374] italic">Unassigned</span>
                        )}
                      </td>

                      <td className="p-3">
                        <EmailStatus t={trackingOf(guest)} />
                      </td>

                      <td className="p-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {canSendEmail && (
                            <button
                              onClick={() => setConfirmGuest(guest)}
                              disabled={!guest.person.email || sendingId === guest.id}
                              className="px-2.5 py-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md font-semibold text-[11px] inline-flex items-center gap-1.5 transition-colors shadow-sm"
                              title={guest.person.email ? "Send the invitation email to this dignitary" : "No email address on record"}
                            >
                              {sendingId === guest.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                              <span>
                                {sendingId === guest.id ? "Sending…" : trackingOf(guest).sendCount > 0 ? "Resend" : "Send Email"}
                              </span>
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenPreview(guest)}
                            className="px-2.5 py-1 bg-white border border-[#E3E6EB] hover:border-[#2563EB] text-[#2563EB] rounded-md font-semibold text-[11px] inline-flex items-center gap-1.5 transition-colors shadow-sm"
                            title="Preview Official Pass &amp; Invitation"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Pass</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* COMPREHENSIVE ADD DIGNITARY MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-[#E3E6EB] space-y-4 my-8 max-h-[92vh] flex flex-col">
            <div className="border-b border-[#E3E6EB] pb-3 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-editorial text-lg font-bold text-[#091833]">
                  Add Dignitary to Guest Directory
                </h3>
                <p className="text-xs text-[#5B6374]">
                  Provide full dignitary details, institution, precedence rank, and seat reference.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-7 h-7 rounded-full bg-[#F6F7F9] hover:bg-[#E3E6EB] text-[#5B6374] flex items-center justify-center text-xs font-semibold"
              >
                ✕
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleAddGuest} className="space-y-4 text-xs flex-1 overflow-y-auto pr-1">
              {/* SECTION 1: DIGNITARY IDENTITY */}
              <div className="space-y-3">
                <span className="text-[11px] font-bold text-[#5B6374] uppercase tracking-wider block border-b border-[#E3E6EB] pb-1">
                  1. Dignitary Identity
                </span>

                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="font-semibold text-[#5B6374] block mb-1">Title</label>
                    <select
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full border border-[#E3E6EB] rounded-lg p-2 bg-white focus:outline-none focus:border-[#2563EB]"
                    >
                      {HONORIFIC_TITLES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="font-semibold text-[#5B6374] block mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Alban Sumana Kingsford Bagbin"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="w-full border border-[#E3E6EB] rounded-lg p-2 font-semibold text-[#091833] focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-[#5B6374] block mb-1">Company / Institution *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Parliament of Ghana / British High Commission"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      className="w-full border border-[#E3E6EB] rounded-lg p-2 focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                  <div>
                    <label htmlFor="designation" className="font-semibold text-[#5B6374] block mb-1">Designation / Official Post *</label>
                    <select
                      id="designation"
                      required
                      value={formData.designation}
                      onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                      className="w-full border border-[#E3E6EB] rounded-lg p-2 bg-white focus:outline-none focus:border-[#2563EB]"
                    >
                      <option value="" disabled>
                        Select designation…
                      </option>
                      {DESIGNATION_GROUPS.map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      <option value={OTHER_DESIGNATION}>Others (type below)</option>
                    </select>
                    {formData.designation === OTHER_DESIGNATION && (
                      <input
                        type="text"
                        required
                        autoFocus
                        aria-label="Custom designation"
                        placeholder="Type the designation, e.g. Executive Secretary"
                        value={formData.customDesignation}
                        onChange={(e) => setFormData({ ...formData, customDesignation: e.target.value })}
                        className="mt-2 w-full border border-[#2563EB] rounded-lg p-2 focus:outline-none"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION 2: CONTACT & NOTIFICATIONS */}
              <div className="space-y-3 pt-2">
                <span className="text-[11px] font-bold text-[#5B6374] uppercase tracking-wider block border-b border-[#E3E6EB] pb-1">
                  2. Contact &amp; Reminders (Email &amp; SMS)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-[#5B6374] block mb-1 flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-[#2563EB]" />
                      Email Address (for invitations)
                    </label>
                    <input
                      type="email"
                      placeholder="dignitary@institution.gov.gh"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full border border-[#E3E6EB] rounded-lg p-2 font-mono text-xs focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-[#5B6374] block mb-1 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      Phone Number (for SMS reminders)
                    </label>
                    <input
                      type="text"
                      placeholder="+233 24 000 0000"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full border border-[#E3E6EB] rounded-lg p-2 font-mono text-xs focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: PROTOCOL & SEATING */}
              <div className="space-y-3 pt-2">
                <span className="text-[11px] font-bold text-[#5B6374] uppercase tracking-wider block border-b border-[#E3E6EB] pb-1">
                  3. Precedence Rank &amp; Seat Assignment
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-[#5B6374] block mb-1 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-[#2563EB]" />
                      Protocol Precedence Rank *
                    </label>
                    <select
                      value={formData.protocolCategoryId}
                      onChange={(e) => handleCategorySelect(e.target.value)}
                      className="w-full border border-[#E3E6EB] rounded-lg p-2 bg-white focus:outline-none focus:border-[#2563EB]"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          Rank {c.rankOrder}: {c.name.slice(0, 32)}...
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-[#5B6374] block mb-1">Companion Allowance</label>
                    <input
                      type="number"
                      min="0"
                      max="5"
                      value={formData.companionAllowance}
                      onChange={(e) =>
                        setFormData({ ...formData, companionAllowance: parseInt(e.target.value) || 0 })
                      }
                      className="w-full border border-[#E3E6EB] rounded-lg p-2 focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-[#5B6374] block mb-1">Seating Section</label>
                    <select
                      value={formData.sectionId}
                      onChange={(e) => setFormData({ ...formData, sectionId: e.target.value })}
                      className="w-full border border-[#E3E6EB] rounded-lg p-2 bg-white focus:outline-none focus:border-[#2563EB]"
                    >
                      <option value="">-- Auto Match by Rank --</option>
                      {seatingSections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.sectionCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="font-semibold text-[#5B6374] block mb-1 flex items-center gap-1">
                      <Armchair className="w-3.5 h-3.5 text-[#2563EB]" />
                      Seat Number &amp; Reference
                    </span>
                    <div className="w-full rounded-lg p-2 bg-brand-pale text-brand-blue flex items-center gap-1.5" aria-live="polite">
                      <Sparkles className="w-3.5 h-3.5 flex-none" />
                      <span>
                        Allocated automatically on save
                        {autoSection ? ` · next free seat in ${autoSection.name}` : ""}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-[#5B6374] block mb-1">Operational &amp; VIP Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Requires front-row accessibility, dietary preferences"
                    value={formData.operationalNotes}
                    onChange={(e) => setFormData({ ...formData, operationalNotes: e.target.value })}
                    className="w-full border border-[#E3E6EB] rounded-lg p-2 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-[#E3E6EB] flex justify-end gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-[#E3E6EB] rounded-lg text-xs font-semibold text-[#5B6374] hover:bg-[#F6F7F9]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold rounded-lg text-xs shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? "Saving..." : "Save & Allocate Seat"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SEND INVITATION CONFIRMATION — the email is the approved template, not editable */}
      {confirmGuest && (
        <div
          className="fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Send invitation email"
          onClick={(e) => e.target === e.currentTarget && setConfirmGuest(null)}
        >
          <div className="bg-white rounded-[22px] max-w-md w-full p-6 shadow-float space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-[10px] bg-brand-pale text-brand-blue grid place-items-center flex-none">
                <Send className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[17px] font-medium text-brand-ink">
                  {trackingOf(confirmGuest).sendCount > 0 ? "Resend invitation?" : "Send invitation?"}
                </h3>
                <p className="text-[13px] text-brand-muted mt-1">
                  The official invitation template will be sent to{" "}
                  <strong className="text-brand-ink">
                    {[confirmGuest.person.title, confirmGuest.person.fullName].filter(Boolean).join(" ")}
                  </strong>{" "}
                  at <span className="font-mono text-brand-ink">{confirmGuest.person.email}</span>, with their own RSVP link and reference. Opens are tracked.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmGuest(null)}
                className="px-4 py-2 border border-brand-line rounded-[10px] text-xs font-semibold text-brand-muted hover:bg-brand-soft"
              >
                Cancel
              </button>
              <button
                autoFocus
                onClick={() => sendEmail(confirmGuest)}
                className="px-4 py-2 bg-brand-blue hover:bg-brand-blueDark text-white rounded-[10px] text-xs font-semibold flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Send now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIGNITARY DETAIL PANEL */}
      {detailGuestId && (() => {
        const g = guests.find((x) => x.id === detailGuestId);
        return (
          <GuestDetailDrawer
            guestId={detailGuestId}
            reloadKey={detailReload}
            canSendEmail={canSendEmail}
            sending={sendingId === detailGuestId}
            onClose={() => setDetailGuestId(null)}
            onSend={() => g && setConfirmGuest(g)}
            onViewPass={() => g && handleOpenPreview(g)}
          />
        );
      })()}

      {/* TEMPLATE PREVIEW MODAL */}
      {previewData && (
        <TemplatePreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          data={previewData}
          guestId={previewGuestId}
        />
      )}
    </div>
  );
}
