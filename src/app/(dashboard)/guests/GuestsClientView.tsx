"use client";

import { useState } from "react";
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
} from "lucide-react";
import { TemplatePreviewModal } from "@/components/templates/TemplatePreviewModal";
import { TemplateData } from "@/components/templates/PassTemplate";

interface GuestItem {
  id: string;
  guestReference: string | null;
  companionAllowance: number;
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

export function GuestsClientView({
  eventId,
  initialGuests,
  categories,
  seatingSections = [],
}: {
  eventId: string;
  initialGuests: any[];
  categories: CategoryItem[];
  seatingSections?: SeatingSectionItem[];
}) {
  const [guests, setGuests] = useState<GuestItem[]>(initialGuests);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedRsvp, setSelectedRsvp] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Template Preview Modal
  const [previewData, setPreviewData] = useState<TemplateData | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    title: "Hon.",
    fullName: "",
    designation: "",
    company: "",
    email: "",
    phone: "",
    protocolCategoryId: categories[0]?.id || "",
    sectionId: seatingSections[0]?.id || "",
    seatCode: "",
    companionAllowance: 1,
    operationalNotes: "",
  });

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

    return matchesSearch && matchesCategory && matchesRsvp;
  });

  // When protocol category changes in form, auto-suggest the matching seating section
  const handleCategorySelect = (categoryId: string) => {
    const matchingSection = seatingSections.find((s) => s.protocolCategoryId === categoryId);
    setFormData((prev) => ({
      ...prev,
      protocolCategoryId: categoryId,
      sectionId: matchingSection?.id || prev.sectionId,
    }));
  };

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
          designation: formData.designation.trim(),
          company: formData.company.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          protocolCategoryId: formData.protocolCategoryId,
          sectionId: formData.sectionId || undefined,
          seatCode: formData.seatCode.trim() || undefined,
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

        // Reset form
        setFormData({
          title: "Hon.",
          fullName: "",
          designation: "",
          company: "",
          email: "",
          phone: "",
          protocolCategoryId: categories[0]?.id || "",
          sectionId: seatingSections[0]?.id || "",
          seatCode: "",
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

    setPreviewData({
      guestTitle: guest.person.title,
      fullName: guest.person.fullName,
      designation: guest.person.designation,
      company: guest.institution?.name || "State Dignitary",
      rankName: cat?.name || "General Dignitary",
      rankOrder: cat?.rankOrder || 1,
      rankColourHex: cat?.colourHex || "#2563EB",
      seatReference: seatAssign?.seat?.seatCode || `SEC-${cat?.rankOrder || 1}-R1-S01`,
      sectionName: seatAssign?.section?.name || `Section Rank ${cat?.rankOrder || 1}`,
      invitationReference: guest.invitations?.[0]?.invitationReference || guest.guestReference || "GH-INV-8821",
    });
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
                <th className="p-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5B6374] text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E6EB] text-xs">
              {filteredGuests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[#5B6374]">
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
                        <div className="font-semibold text-[#091833]">
                          {guest.person.title ? `${guest.person.title} ` : ""}
                          {guest.person.fullName}
                        </div>
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

                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleOpenPreview(guest)}
                          className="px-2.5 py-1 bg-white border border-[#E3E6EB] hover:border-[#2563EB] text-[#2563EB] rounded-md font-semibold text-[11px] inline-flex items-center gap-1.5 transition-colors shadow-sm"
                          title="Preview Official Pass &amp; Invitation"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Pass</span>
                        </button>
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
                    <label className="font-semibold text-[#5B6374] block mb-1">Designation / Official Post</label>
                    <input
                      type="text"
                      placeholder="e.g. Speaker of Parliament / Ambassador"
                      value={formData.designation}
                      onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                      className="w-full border border-[#E3E6EB] rounded-lg p-2 focus:outline-none focus:border-[#2563EB]"
                    />
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
                    <label className="font-semibold text-[#5B6374] block mb-1 flex items-center gap-1">
                      <Armchair className="w-3.5 h-3.5 text-[#2563EB]" />
                      Seat Number / Reference
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. SEC-A-R1-S01 or Row 1-Seat 5"
                      value={formData.seatCode}
                      onChange={(e) => setFormData({ ...formData, seatCode: e.target.value })}
                      className="w-full border border-[#E3E6EB] rounded-lg p-2 font-mono uppercase focus:outline-none focus:border-[#2563EB]"
                    />
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
                  <span>{isSubmitting ? "Saving..." : "Save &amp; Generate Credentials"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TEMPLATE PREVIEW MODAL */}
      {previewData && (
        <TemplatePreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          data={previewData}
        />
      )}
    </div>
  );
}
