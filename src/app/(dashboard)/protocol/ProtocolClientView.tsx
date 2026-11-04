"use client";

import { useState } from "react";
import {
  Award,
  Users,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Mail,
  Eye,
  Armchair,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Check,
  Building2,
  ExternalLink,
  ChevronRight,
  UserPlus,
} from "lucide-react";
import { TemplatePreviewModal } from "@/components/templates/TemplatePreviewModal";
import { TemplateData } from "@/components/templates/PassTemplate";

interface Dignitary {
  id: string;
  guestReference: string | null;
  companionAllowance: number;
  person: {
    id: string;
    title: string | null;
    fullName: string;
    designation: string | null;
    email: string | null;
    phone: string | null;
  };
  institution: {
    name: string;
  } | null;
  protocolCategory: {
    id: string;
    name: string;
    rankOrder: number;
    colourHex: string;
  } | null;
  invitations: Array<{
    invitationReference: string;
    invitationStatus: string;
    rsvps: Array<{
      response: string;
      companionCount: number;
      submittedAt: string;
    }>;
    emailAttempts: Array<{
      attemptNumber: number;
      status: string;
      submittedAt: string | null;
    }>;
    invitationEvents: Array<{
      eventType: string;
      occurredAt: string;
    }>;
  }>;
  seatAssignments: Array<{
    section: { name: string; colourHex: string | null };
    seat: { seatCode: string } | null;
  }>;
}

interface ProtocolCategory {
  id: string;
  eventId: string;
  name: string;
  rankOrder: number;
  colourHex: string;
  description: string | null;
  eventGuests: Dignitary[];
  stats?: {
    totalGuests: number;
    confirmedCount: number;
    declinedCount: number;
    pendingCount: number;
    emailsSentCount: number;
    emailsOpenedCount: number;
    repliedCount: number;
    seatedCount: number;
  };
}

const PRESET_COLOURS = [
  { label: "Parliamentary Navy", hex: "#102343" },
  { label: "Republic Gold", hex: "#C6A65B" },
  { label: "National Green", hex: "#18794E" },
  { label: "Imperial Purple", hex: "#6B21A8" },
  { label: "Heritage Amber", hex: "#EA580C" },
  { label: "State Crimson", hex: "#B42318" },
  { label: "Royal Blue", hex: "#2563EB" },
  { label: "Deep Teal", hex: "#0E7490" },
];

export function ProtocolClientView({
  eventId,
  initialCategories,
  allGuests,
}: {
  eventId: string;
  initialCategories: ProtocolCategory[];
  allGuests: any[];
}) {
  const [categories, setCategories] = useState<ProtocolCategory[]>(initialCategories);
  const [selectedRank, setSelectedRank] = useState<ProtocolCategory | null>(null);
  const [isAddRankOpen, setIsAddRankOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [targetCategoryForAssign, setTargetCategoryForAssign] = useState<ProtocolCategory | null>(null);
  const [selectedGuestIdsToAssign, setSelectedGuestIdsToAssign] = useState<string[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);

  // Filter inside the opened rank overview
  const [rankSearchQuery, setRankSearchQuery] = useState("");
  const [rankStatusFilter, setRankStatusFilter] = useState("all");

  // Template Preview Modal
  const [previewTemplateData, setPreviewTemplateData] = useState<TemplateData | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // New Rank Form State
  const [newRankForm, setNewRankForm] = useState({
    name: "",
    rankOrder: (categories.length + 1).toString(),
    colourHex: "#102343",
    description: "",
  });
  const [isCreatingRank, setIsCreatingRank] = useState(false);

  // Helper to compute stats for a category
  const getCategoryStats = (cat: ProtocolCategory) => {
    const guests = cat.eventGuests || [];
    let confirmedCount = 0;
    let declinedCount = 0;
    let pendingCount = 0;
    let emailsSentCount = 0;
    let emailsOpenedCount = 0;
    let repliedCount = 0;
    let seatedCount = 0;

    for (const g of guests) {
      const inv = g.invitations?.[0];
      const rsvp = inv?.rsvps?.[0];

      if (rsvp?.response === "accepted") {
        confirmedCount++;
        repliedCount++;
      } else if (rsvp?.response === "declined") {
        declinedCount++;
        repliedCount++;
      } else {
        pendingCount++;
      }

      if (inv?.invitationStatus === "sent" || (inv?.emailAttempts && inv.emailAttempts.length > 0)) {
        emailsSentCount++;
      }

      const hasOpened = inv?.invitationEvents?.some(
        (e) => e.eventType === "open_signal" || e.eventType === "link_access"
      );
      if (hasOpened) {
        emailsOpenedCount++;
      }

      if (g.seatAssignments && g.seatAssignments.length > 0) {
        seatedCount++;
      }
    }

    return {
      totalGuests: guests.length,
      confirmedCount,
      declinedCount,
      pendingCount,
      emailsSentCount,
      emailsOpenedCount,
      repliedCount,
      seatedCount,
    };
  };

  // Handle Add Rank Form Submission
  const handleCreateRank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRankForm.name.trim()) return;
    setIsCreatingRank(true);

    try {
      const res = await fetch("/api/v1/protocol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          name: newRankForm.name,
          rankOrder: parseInt(newRankForm.rankOrder, 10) || categories.length + 1,
          colourHex: newRankForm.colourHex,
          description: newRankForm.description,
        }),
      });

      const json = await res.json();
      if (res.ok && json.data) {
        const createdCat: ProtocolCategory = {
          ...json.data,
          eventGuests: [],
          stats: {
            totalGuests: 0,
            confirmedCount: 0,
            declinedCount: 0,
            pendingCount: 0,
            emailsSentCount: 0,
            emailsOpenedCount: 0,
            repliedCount: 0,
            seatedCount: 0,
          },
        };

        const updated = [...categories, createdCat].sort((a, b) => a.rankOrder - b.rankOrder);
        setCategories(updated);
        setIsAddRankOpen(false);
        setNewRankForm({
          name: "",
          rankOrder: (updated.length + 1).toString(),
          colourHex: "#102343",
          description: "",
        });
      } else {
        alert(json.error || "Failed to create rank");
      }
    } catch (err) {
      console.error("Error creating rank:", err);
      alert("Network error while creating rank");
    } finally {
      setIsCreatingRank(false);
    }
  };

  // Open Assign Dignitaries Modal
  const openAssignModal = (cat: ProtocolCategory) => {
    setTargetCategoryForAssign(cat);
    setSelectedGuestIdsToAssign([]);
    setIsAssignModalOpen(true);
  };

  // Handle Assign Dignitaries
  const handleAssignGuests = async () => {
    if (!targetCategoryForAssign || selectedGuestIdsToAssign.length === 0) return;
    setIsAssigning(true);

    try {
      const res = await fetch("/api/v1/protocol", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign_guests",
          eventId,
          categoryId: targetCategoryForAssign.id,
          guestIds: selectedGuestIdsToAssign,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        // Re-fetch all categories from protocol GET endpoint to get synced stats
        const getRes = await fetch(`/api/v1/protocol?eventId=${eventId}`);
        const getJson = await getRes.json();
        if (getJson.data) {
          setCategories(getJson.data);
          if (selectedRank?.id === targetCategoryForAssign.id) {
            const updatedSelected = getJson.data.find((c: any) => c.id === targetCategoryForAssign.id);
            if (updatedSelected) setSelectedRank(updatedSelected);
          }
        }
        setIsAssignModalOpen(false);
        setSelectedGuestIdsToAssign([]);
      } else {
        alert(json.error || "Failed to assign dignitaries");
      }
    } catch (err) {
      console.error("Error assigning dignitaries:", err);
    } finally {
      setIsAssigning(false);
    }
  };

  // Open Template Preview for a dignitary
  const openTemplateForGuest = (guest: Dignitary, cat: ProtocolCategory) => {
    const seat = guest.seatAssignments?.[0];
    const inv = guest.invitations?.[0];

    setPreviewTemplateData({
      guestTitle: guest.person.title,
      fullName: guest.person.fullName,
      designation: guest.person.designation,
      company: guest.institution?.name || "State Dignitary",
      rankName: cat.name,
      rankOrder: cat.rankOrder,
      rankColourHex: cat.colourHex,
      seatReference: seat?.seat?.seatCode || `SEC-${cat.rankOrder}-R1-S01`,
      sectionName: seat?.section?.name || `Section Rank ${cat.rankOrder}`,
      invitationReference: inv?.invitationReference || guest.guestReference || "GH-INV-8821",
    });
    setIsPreviewModalOpen(true);
  };

  // Calculate Overall Platform Stats
  const totalRanks = categories.length;
  const totalDignitaries = categories.reduce((sum, c) => sum + (c.eventGuests?.length || 0), 0);
  const totalApproved = categories.reduce((sum, c) => sum + (getCategoryStats(c).confirmedCount), 0);
  const totalPending = categories.reduce((sum, c) => sum + (getCategoryStats(c).pendingCount), 0);

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-[#E3E6EB] shadow-sm">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[#5B6374]">
            Official State Precedence Configuration
          </div>
          <div className="text-sm font-medium text-[#091833] mt-0.5">
            Configure institutional ranks, inspect dignity response stats, and assign guests.
          </div>
        </div>

        <button
          onClick={() => setIsAddRankOpen(true)}
          className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Protocol Rank</span>
        </button>
      </div>

      {/* Global Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#E3E6EB] shadow-sm">
          <div className="text-[11px] font-semibold text-[#5B6374] uppercase tracking-wider">
            Total Protocol Ranks
          </div>
          <div className="text-2xl font-bold font-editorial text-[#091833] mt-1">
            {totalRanks}
          </div>
          <div className="text-[11px] text-[#5B6374] mt-0.5">Precedence tiers</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E3E6EB] shadow-sm">
          <div className="text-[11px] font-semibold text-[#5B6374] uppercase tracking-wider">
            Ranked Dignitaries
          </div>
          <div className="text-2xl font-bold font-editorial text-[#2563EB] mt-1">
            {totalDignitaries}
          </div>
          <div className="text-[11px] text-[#5B6374] mt-0.5">Assigned to official ranks</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E3E6EB] shadow-sm">
          <div className="text-[11px] font-semibold text-[#5B6374] uppercase tracking-wider">
            Approved to Attend
          </div>
          <div className="text-2xl font-bold font-editorial text-emerald-600 mt-1">
            {totalApproved}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
            {totalDignitaries > 0 ? `${Math.round((totalApproved / totalDignitaries) * 100)}% confirmed` : "No guests yet"}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E3E6EB] shadow-sm">
          <div className="text-[11px] font-semibold text-[#5B6374] uppercase tracking-wider">
            Awaiting Confirmation
          </div>
          <div className="text-2xl font-bold font-editorial text-amber-600 mt-1">
            {totalPending}
          </div>
          <div className="text-[11px] text-[#5B6374] mt-0.5">Pending RSVP dispatches</div>
        </div>
      </div>

      {/* Ranks Cards List */}
      <div className="space-y-4">
        {categories.map((cat) => {
          const stats = getCategoryStats(cat);

          return (
            <div
              key={cat.id}
              className="bg-white border border-[#E3E6EB] hover:border-[#2563EB] rounded-xl p-5 shadow-sm transition-all"
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#E3E6EB] gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white text-base flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: cat.colourHex }}
                  >
                    {cat.rankOrder}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-editorial text-base sm:text-lg font-bold text-[#091833]">
                        {cat.name}
                      </h3>
                      <span
                        className="text-[10px] font-bold px-2.5 py-0.5 rounded-full text-white uppercase tracking-wider"
                        style={{ backgroundColor: cat.colourHex }}
                      >
                        Rank {cat.rankOrder}
                      </span>
                    </div>
                    {cat.description && (
                      <p className="text-xs text-[#5B6374] mt-1 max-w-[80ch]">
                        {cat.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Primary Card Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openAssignModal(cat)}
                    className="px-3 py-2 bg-white border border-[#E3E6EB] hover:border-[#2563EB] text-[#091833] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-[#2563EB]" />
                    <span>Assign Dignitaries</span>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedRank(cat);
                      setRankSearchQuery("");
                      setRankStatusFilter("all");
                    }}
                    className="px-3.5 py-2 bg-[#102343] hover:bg-[#0A1830] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#C6A65B]" />
                    <span>Open Rank Overview ({stats.totalGuests})</span>
                  </button>
                </div>
              </div>

              {/* Status & Stats Overview Row for this Rank */}
              <div className="pt-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="bg-[#F6F7F9] p-2.5 rounded-lg border border-[#E3E6EB]">
                  <span className="text-[10px] uppercase font-semibold text-[#5B6374] block">
                    Total Dignitaries
                  </span>
                  <span className="text-base font-bold text-[#091833]">
                    {stats.totalGuests}
                  </span>
                </div>

                <div className="bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-200">
                  <span className="text-[10px] uppercase font-semibold text-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Approved / Attending
                  </span>
                  <span className="text-base font-bold text-emerald-700">
                    {stats.confirmedCount}
                  </span>
                </div>

                <div className="bg-amber-50/70 p-2.5 rounded-lg border border-amber-200">
                  <span className="text-[10px] uppercase font-semibold text-amber-800 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-600" />
                    Awaiting RSVP
                  </span>
                  <span className="text-base font-bold text-amber-700">
                    {stats.pendingCount}
                  </span>
                </div>

                <div className="bg-blue-50/70 p-2.5 rounded-lg border border-blue-200">
                  <span className="text-[10px] uppercase font-semibold text-blue-800 flex items-center gap-1">
                    <Mail className="w-3 h-3 text-[#2563EB]" />
                    Email Server Opened
                  </span>
                  <span className="text-base font-bold text-blue-700">
                    {stats.emailsOpenedCount}
                  </span>
                </div>

                <div className="bg-purple-50/70 p-2.5 rounded-lg border border-purple-200">
                  <span className="text-[10px] uppercase font-semibold text-purple-800 flex items-center gap-1">
                    <Armchair className="w-3 h-3 text-purple-600" />
                    Allocated Seats
                  </span>
                  <span className="text-base font-bold text-purple-700">
                    {stats.seatedCount} / {stats.totalGuests}
                  </span>
                </div>
              </div>

              {/* Dignitary Roster Pill Previews */}
              <div className="pt-3">
                <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6374] uppercase tracking-wider mb-2">
                  <span>Registered Dignitaries ({cat.eventGuests.length})</span>
                  <button
                    onClick={() => {
                      setSelectedRank(cat);
                      setRankSearchQuery("");
                      setRankStatusFilter("all");
                    }}
                    className="text-[#2563EB] hover:underline normal-case font-normal flex items-center gap-1"
                  >
                    View detailed roster with emails &amp; seats &rarr;
                  </button>
                </div>

                {cat.eventGuests.length === 0 ? (
                  <div className="p-3 text-xs text-[#5B6374] bg-[#F6F7F9] rounded-lg border border-dashed border-[#E3E6EB] text-center">
                    No dignitaries assigned to this rank yet. Click &quot;Assign Dignitaries&quot; to add.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                    {cat.eventGuests.slice(0, 6).map((g) => {
                      const latestRsvp = g.invitations?.[0]?.rsvps?.[0];
                      const seat = g.seatAssignments?.[0];

                      return (
                        <div
                          key={g.id}
                          className="p-2.5 rounded-lg border border-[#E3E6EB] bg-[#F6F7F9]/60 flex items-center justify-between hover:bg-white hover:border-[#2563EB] transition-colors"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="font-semibold text-[#091833] truncate">
                              {g.person.title ? `${g.person.title} ` : ""}
                              {g.person.fullName}
                            </div>
                            <div className="text-[11px] text-[#5B6374] truncate">
                              {g.person.designation || g.institution?.name || "State Dignitary"}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {latestRsvp?.response === "accepted" ? (
                              <span className="w-2 h-2 rounded-full bg-emerald-500" title="Confirmed" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-amber-400" title="Pending" />
                            )}
                            <button
                              onClick={() => openTemplateForGuest(g, cat)}
                              className="text-[#2563EB] hover:text-[#1D4ED8] p-1 rounded hover:bg-blue-50"
                              title="Preview Pass / Template"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* DETAILED RANK OVERVIEW MODAL / DRAWER */}
      {selectedRank && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-[#E3E6EB] space-y-5 my-8 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[#E3E6EB] pb-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white text-lg flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: selectedRank.colourHex }}
                >
                  {selectedRank.rankOrder}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-editorial text-xl font-bold text-[#091833]">
                      Rank {selectedRank.rankOrder}: {selectedRank.name}
                    </h2>
                    <span
                      className="text-[10px] font-bold px-2.5 py-0.5 rounded-full text-white uppercase tracking-wider"
                      style={{ backgroundColor: selectedRank.colourHex }}
                    >
                      Active Protocol Tier
                    </span>
                  </div>
                  <p className="text-xs text-[#5B6374] mt-0.5 max-w-[70ch]">
                    {selectedRank.description || "Official precedence ranking rules governing dignitary invitation dispatches and seating."}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedRank(null)}
                className="w-8 h-8 rounded-full bg-[#F6F7F9] hover:bg-[#E3E6EB] text-[#5B6374] flex items-center justify-center text-sm font-semibold transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Comprehensive Rank Statistics Bar */}
            {(() => {
              const stats = getCategoryStats(selectedRank);
              const confirmedPct = stats.totalGuests > 0 ? Math.round((stats.confirmedCount / stats.totalGuests) * 100) : 0;
              const openedPct = stats.totalGuests > 0 ? Math.round((stats.emailsOpenedCount / stats.totalGuests) * 100) : 0;

              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-shrink-0">
                  <div className="bg-[#F6F7F9] p-3 rounded-xl border border-[#E3E6EB]">
                    <div className="text-[10px] uppercase font-semibold text-[#5B6374]">
                      Total Dignitaries in Rank
                    </div>
                    <div className="text-2xl font-bold font-editorial text-[#091833] mt-0.5">
                      {stats.totalGuests}
                    </div>
                    <div className="text-[11px] text-[#5B6374] mt-0.5">Official roster</div>
                  </div>

                  <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
                    <div className="text-[10px] uppercase font-semibold text-emerald-800 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Approved to Come
                    </div>
                    <div className="text-2xl font-bold font-editorial text-emerald-700 mt-0.5">
                      {stats.confirmedCount}
                    </div>
                    <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                      {confirmedPct}% response approval
                    </div>
                  </div>

                  <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200">
                    <div className="text-[10px] uppercase font-semibold text-blue-800 flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-[#2563EB]" />
                      Email Servers Opened
                    </div>
                    <div className="text-2xl font-bold font-editorial text-blue-700 mt-0.5">
                      {stats.emailsOpenedCount}
                    </div>
                    <div className="text-[11px] text-blue-700 font-medium mt-0.5">
                      {openedPct}% open signals logged
                    </div>
                  </div>

                  <div className="bg-purple-50/70 p-3 rounded-xl border border-purple-200">
                    <div className="text-[10px] uppercase font-semibold text-purple-800 flex items-center gap-1">
                      <Armchair className="w-3.5 h-3.5 text-purple-600" />
                      Assigned Seats
                    </div>
                    <div className="text-2xl font-bold font-editorial text-purple-700 mt-0.5">
                      {stats.seatedCount} / {stats.totalGuests}
                    </div>
                    <div className="text-[11px] text-purple-700 font-medium mt-0.5">
                      Reserved seat references
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Filter and Search Bar inside Drawer */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#F6F7F9] p-3 rounded-xl flex-shrink-0">
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-[#5B6374]" />
                <input
                  type="text"
                  placeholder="Filter by name, institution, or email..."
                  value={rankSearchQuery}
                  onChange={(e) => setRankSearchQuery(e.target.value)}
                  className="w-full text-xs bg-white border border-[#E3E6EB] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={rankStatusFilter}
                  onChange={(e) => setRankStatusFilter(e.target.value)}
                  className="text-xs bg-white border border-[#E3E6EB] rounded-lg px-3 py-1.5 font-medium text-[#091833] focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="all">All RSVP &amp; Activity</option>
                  <option value="accepted">Approved / Confirmed Only</option>
                  <option value="declined">Declined Only</option>
                  <option value="pending">Pending RSVP Only</option>
                  <option value="opened">Email Opened Only</option>
                </select>

                <button
                  onClick={() => openAssignModal(selectedRank)}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Assign More Dignitaries</span>
                </button>
              </div>
            </div>

            {/* Roster Table of Dignitaries in this Rank */}
            <div className="flex-1 overflow-y-auto border border-[#E3E6EB] rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#F6F7F9] text-[#5B6374] border-b border-[#E3E6EB] sticky top-0 z-10">
                  <tr>
                    <th className="p-3 font-semibold uppercase tracking-wider text-[10px]">
                      Dignitary &amp; Institution
                    </th>
                    <th className="p-3 font-semibold uppercase tracking-wider text-[10px]">
                      Contact Details
                    </th>
                    <th className="p-3 font-semibold uppercase tracking-wider text-[10px]">
                      RSVP Status
                    </th>
                    <th className="p-3 font-semibold uppercase tracking-wider text-[10px]">
                      Email Activity
                    </th>
                    <th className="p-3 font-semibold uppercase tracking-wider text-[10px]">
                      Seat Reference
                    </th>
                    <th className="p-3 font-semibold uppercase tracking-wider text-[10px] text-right">
                      Pass / Template
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E6EB]">
                  {(() => {
                    const filtered = selectedRank.eventGuests.filter((g) => {
                      const matchesQuery =
                        rankSearchQuery === "" ||
                        g.person.fullName.toLowerCase().includes(rankSearchQuery.toLowerCase()) ||
                        g.institution?.name.toLowerCase().includes(rankSearchQuery.toLowerCase()) ||
                        g.person.email?.toLowerCase().includes(rankSearchQuery.toLowerCase());

                      const inv = g.invitations?.[0];
                      const rsvp = inv?.rsvps?.[0]?.response || "pending";
                      const hasOpened = inv?.invitationEvents?.some(
                        (e) => e.eventType === "open_signal" || e.eventType === "link_access"
                      );

                      let matchesStatus = true;
                      if (rankStatusFilter === "accepted") matchesStatus = rsvp === "accepted";
                      if (rankStatusFilter === "declined") matchesStatus = rsvp === "declined";
                      if (rankStatusFilter === "pending") matchesStatus = rsvp === "pending";
                      if (rankStatusFilter === "opened") matchesStatus = !!hasOpened;

                      return matchesQuery && matchesStatus;
                    });

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-[#5B6374]">
                            No dignitaries in this rank match your filter criteria.
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map((guest) => {
                      const inv = guest.invitations?.[0];
                      const latestRsvp = inv?.rsvps?.[0];
                      const seat = guest.seatAssignments?.[0];
                      const hasOpened = inv?.invitationEvents?.some(
                        (e) => e.eventType === "open_signal" || e.eventType === "link_access"
                      );

                      return (
                        <tr key={guest.id} className="hover:bg-[#F6F7F9]/70 transition-colors">
                          <td className="p-3">
                            <div className="font-semibold text-[#091833]">
                              {guest.person.title ? `${guest.person.title} ` : ""}
                              {guest.person.fullName}
                            </div>
                            <div className="text-[11px] text-[#5B6374]">
                              {guest.person.designation || "Distinguished Guest"} &bull;{" "}
                              <strong className="text-[#091833]">{guest.institution?.name || "General Delegation"}</strong>
                            </div>
                          </td>

                          <td className="p-3 text-[11px]">
                            <div className="font-mono text-[#091833]">{guest.person.email || "No email"}</div>
                            <div className="text-[#5B6374]">{guest.person.phone || "No phone"}</div>
                          </td>

                          <td className="p-3">
                            {latestRsvp?.response === "accepted" ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Confirmed (+{latestRsvp.companionCount})
                              </span>
                            ) : latestRsvp?.response === "declined" ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800">
                                <XCircle className="w-3 h-3 text-rose-600" />
                                Regrets / Declined
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                                <Clock className="w-3 h-3 text-amber-600" />
                                Awaiting Response
                              </span>
                            )}
                          </td>

                          <td className="p-3 text-[11px]">
                            {hasOpened ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <Eye className="w-3 h-3 text-emerald-600" />
                                Server Opened
                              </span>
                            ) : inv ? (
                              <span className="inline-flex items-center gap-1 text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                <Mail className="w-3 h-3 text-[#2563EB]" />
                                Sent / Delivered
                              </span>
                            ) : (
                              <span className="text-[#5B6374] italic">Not Dispatched</span>
                            )}
                          </td>

                          <td className="p-3">
                            {seat ? (
                              <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#091833]">
                                <Armchair className="w-3.5 h-3.5 text-[#2563EB]" />
                                <span>{seat.seat?.seatCode || seat.section.name}</span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-[#5B6374] italic">Unassigned</span>
                            )}
                          </td>

                          <td className="p-3 text-right">
                            <button
                              onClick={() => openTemplateForGuest(guest, selectedRank)}
                              className="px-2.5 py-1 bg-white border border-[#E3E6EB] hover:border-[#2563EB] text-[#2563EB] rounded font-semibold text-[11px] inline-flex items-center gap-1 transition-colors shadow-sm"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Pass</span>
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>

            {/* Modal Bottom Actions */}
            <div className="border-t border-[#E3E6EB] pt-3 flex justify-between items-center flex-shrink-0">
              <span className="text-xs text-[#5B6374]">
                Ref: Official Parliamentary Protocol Precedence Register
              </span>
              <button
                onClick={() => setSelectedRank(null)}
                className="px-4 py-2 bg-[#102343] text-white rounded-lg text-xs font-semibold hover:bg-[#0A1830] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD PROTOCOL RANK MODAL */}
      {isAddRankOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-[#E3E6EB] space-y-4">
            <div className="border-b border-[#E3E6EB] pb-3 flex items-center justify-between">
              <div>
                <h3 className="font-editorial text-lg font-bold text-[#091833]">
                  Add Protocol Rank
                </h3>
                <p className="text-xs text-[#5B6374]">
                  Create an official precedence level for dignitaries and state leadership.
                </p>
              </div>
              <button
                onClick={() => setIsAddRankOpen(false)}
                className="w-7 h-7 rounded-full bg-[#F6F7F9] hover:bg-[#E3E6EB] text-[#5B6374] flex items-center justify-center text-xs font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRank} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[#5B6374] block mb-1">Rank Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Constitutional Bodies & Council of State"
                  value={newRankForm.name}
                  onChange={(e) => setNewRankForm({ ...newRankForm, name: e.target.value })}
                  className="w-full border border-[#E3E6EB] rounded-lg p-2.5 font-semibold text-[#091833] focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#5B6374] block mb-1">Rank Order (Precedence) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newRankForm.rankOrder}
                    onChange={(e) => setNewRankForm({ ...newRankForm, rankOrder: e.target.value })}
                    className="w-full border border-[#E3E6EB] rounded-lg p-2.5 focus:outline-none focus:border-[#2563EB]"
                  />
                  <span className="text-[10px] text-[#5B6374] mt-0.5 block">1 = Highest state precedence</span>
                </div>

                <div>
                  <label className="font-semibold text-[#5B6374] block mb-1">Badge Colour</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newRankForm.colourHex}
                      onChange={(e) => setNewRankForm({ ...newRankForm, colourHex: e.target.value })}
                      className="w-10 h-10 rounded border border-[#E3E6EB] cursor-pointer"
                    />
                    <input
                      type="text"
                      value={newRankForm.colourHex}
                      onChange={(e) => setNewRankForm({ ...newRankForm, colourHex: e.target.value })}
                      className="flex-1 font-mono uppercase border border-[#E3E6EB] rounded-lg p-2 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Preset Color Swatches */}
              <div>
                <label className="font-semibold text-[#5B6374] block mb-1.5">Official Protocol Palette</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLOURS.map((col) => (
                    <button
                      type="button"
                      key={col.hex}
                      onClick={() => setNewRankForm({ ...newRankForm, colourHex: col.hex })}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                        newRankForm.colourHex.toLowerCase() === col.hex.toLowerCase()
                          ? "border-[#091833] ring-1 ring-[#091833] shadow-sm"
                          : "border-[#E3E6EB] hover:border-gray-400"
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: col.hex }} />
                      <span>{col.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-semibold text-[#5B6374] block mb-1">Precedence Description &amp; Eligibility</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Members of the Council of State, heads of independent constitutional bodies, and regional ministers."
                  value={newRankForm.description}
                  onChange={(e) => setNewRankForm({ ...newRankForm, description: e.target.value })}
                  className="w-full border border-[#E3E6EB] rounded-lg p-2.5 focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="pt-3 border-t border-[#E3E6EB] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddRankOpen(false)}
                  className="px-4 py-2 border border-[#E3E6EB] rounded-lg text-xs font-semibold text-[#5B6374] hover:bg-[#F6F7F9]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingRank}
                  className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold rounded-lg text-xs shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isCreatingRank ? "Creating..." : "Save Protocol Rank"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN DIGNITARIES MODAL */}
      {isAssignModalOpen && targetCategoryForAssign && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-[#E3E6EB] space-y-4 max-h-[85vh] flex flex-col">
            <div className="border-b border-[#E3E6EB] pb-3 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-editorial text-lg font-bold text-[#091833]">
                  Assign Dignitaries to Rank {targetCategoryForAssign.rankOrder}
                </h3>
                <p className="text-xs text-[#5B6374]">
                  {targetCategoryForAssign.name}
                </p>
              </div>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="w-7 h-7 rounded-full bg-[#F6F7F9] hover:bg-[#E3E6EB] text-[#5B6374] flex items-center justify-center text-xs font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-[#5B6374] flex-shrink-0">
              Select dignitaries below to assign or move into this rank:
            </div>

            <div className="flex-1 overflow-y-auto border border-[#E3E6EB] rounded-xl p-2 divide-y divide-[#E3E6EB]">
              {allGuests.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#5B6374]">No guests in event register.</div>
              ) : (
                allGuests.map((g) => {
                  const isAlreadyInTarget = g.protocolCategoryId === targetCategoryForAssign.id;
                  const isChecked = selectedGuestIdsToAssign.includes(g.id);

                  return (
                    <label
                      key={g.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg text-xs cursor-pointer transition-colors ${
                        isAlreadyInTarget ? "bg-gray-50 opacity-60 cursor-not-allowed" : "hover:bg-[#F6F7F9]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={isAlreadyInTarget}
                        checked={isAlreadyInTarget || isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedGuestIdsToAssign([...selectedGuestIdsToAssign, g.id]);
                          } else {
                            setSelectedGuestIdsToAssign(selectedGuestIdsToAssign.filter((id) => id !== g.id));
                          }
                        }}
                        className="rounded text-[#2563EB]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[#091833] truncate">
                          {g.person?.title ? `${g.person.title} ` : ""}
                          {g.person?.fullName}
                        </div>
                        <div className="text-[11px] text-[#5B6374] truncate">
                          {g.person?.designation || g.institution?.name || "State Dignitary"}
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-700 flex-shrink-0">
                        {isAlreadyInTarget ? "Already in this rank" : g.protocolCategory ? `Rank ${g.protocolCategory.rankOrder}` : "Unranked"}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="border-t border-[#E3E6EB] pt-3 flex justify-between items-center flex-shrink-0">
              <span className="text-xs text-[#5B6374]">
                {selectedGuestIdsToAssign.length} dignitary(ies) selected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-4 py-2 border border-[#E3E6EB] rounded-lg text-xs font-semibold text-[#5B6374] hover:bg-[#F6F7F9]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isAssigning || selectedGuestIdsToAssign.length === 0}
                  onClick={handleAssignGuests}
                  className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold rounded-lg text-xs shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isAssigning ? "Assigning..." : "Confirm Assignment"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATE PREVIEW MODAL */}
      {previewTemplateData && (
        <TemplatePreviewModal
          isOpen={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
          data={previewTemplateData}
        />
      )}
    </div>
  );
}

