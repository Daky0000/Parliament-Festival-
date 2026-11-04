"use client";

import { useState } from "react";
import { PassTemplate, TemplateData } from "@/components/templates/PassTemplate";
import { UserCheck, Armchair, Building2, Award, Printer, Copy, Check, Sparkles, RefreshCw, Layers } from "lucide-react";

export function TemplateStudioClientView({
  event,
  guests,
  categories,
  seatingSections,
}: {
  event: any;
  guests: any[];
  categories: any[];
  seatingSections: any[];
}) {
  const [selectedGuestId, setSelectedGuestId] = useState<string>(guests[0]?.id || "custom");
  const [viewMode, setViewMode] = useState<"badge" | "card" | "email">("badge");
  const [copied, setCopied] = useState(false);

  // Initializing state based on first guest or fallback defaults
  const firstGuest = guests[0];
  const firstSeat = firstGuest?.seatAssignments[0];

  const [formFields, setFormFields] = useState<TemplateData>({
    guestTitle: firstGuest?.person.title || "Rt. Hon.",
    fullName: firstGuest?.person.fullName || "Alban Sumana Kingsford Bagbin",
    designation: firstGuest?.person.designation || "Speaker of Parliament",
    company: firstGuest?.institution?.name || "Parliament of Ghana",
    rankName: firstGuest?.protocolCategory?.name || categories[0]?.name || "Parliamentary Leadership",
    rankOrder: firstGuest?.protocolCategory?.rankOrder || categories[0]?.rankOrder || 1,
    rankColourHex: firstGuest?.protocolCategory?.colourHex || categories[0]?.colourHex || "#102343",
    seatReference: firstSeat?.seat?.seatCode || "SEC-A-R1-S01",
    sectionName: firstSeat?.section?.name || seatingSections[0]?.name || "Section A (Leadership)",
    invitationReference: firstGuest?.invitations[0]?.invitationReference || "GH-INV-8821",
    eventName: event.name || "2026 Festival of Nine Lessons and Carols",
    eventDate: "Friday, 18th December 2026 • 4:00 PM GMT",
    eventVenue: `${event.venueName || "Forecourt of Parliament House"}, Accra`,
  });

  const handleGuestSelect = (guestId: string) => {
    setSelectedGuestId(guestId);
    if (guestId === "custom") return;

    const guest = guests.find((g) => g.id === guestId);
    if (!guest) return;

    const seatAssign = guest.seatAssignments[0];
    const cat = guest.protocolCategory || categories[0];

    setFormFields({
      guestTitle: guest.person.title || "",
      fullName: guest.person.fullName,
      designation: guest.person.designation || "",
      company: guest.institution?.name || "State Dignitary",
      rankName: cat?.name || "General Dignitary",
      rankOrder: cat?.rankOrder || 1,
      rankColourHex: cat?.colourHex || "#2563EB",
      seatReference: seatAssign?.seat?.seatCode || `SEC-${cat?.rankOrder || 1}-R1-S01`,
      sectionName: seatAssign?.section?.name || `Section Rank ${cat?.rankOrder || 1}`,
      invitationReference: guest.invitations[0]?.invitationReference || guest.guestReference || "GH-INV-1001",
      eventName: event.name,
      eventDate: "Friday, 18th December 2026 • 4:00 PM GMT",
      eventVenue: `${event.venueName || "Forecourt of Parliament House"}, Accra`,
    });
  };

  const handleRankChange = (catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return;

    setFormFields((prev) => ({
      ...prev,
      rankName: cat.name,
      rankOrder: cat.rankOrder,
      rankColourHex: cat.colourHex,
    }));
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopySummary = () => {
    const text = `Dignitary: ${formFields.fullName}\nCompany: ${formFields.company}\nRank: Rank ${formFields.rankOrder} (${formFields.rankName})\nSeat: ${formFields.seatReference} (${formFields.sectionName})\nRef: ${formFields.invitationReference}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-[#E3E6EB] flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-semibold text-[#5B6374]">Select Dignitary:</label>
          <select
            value={selectedGuestId}
            onChange={(e) => handleGuestSelect(e.target.value)}
            className="text-xs font-medium border border-[#E3E6EB] rounded-lg px-3 py-2 bg-white text-[#0D1526] focus:outline-none focus:border-[#2563EB] min-w-[260px]"
          >
            <option value="custom">-- Custom Input / Manual Edit --</option>
            {guests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.person.title ? `${g.person.title} ` : ""}
                {g.person.fullName} &bull; {g.institution?.name || "Dignitary"} (Rank {g.protocolCategory?.rankOrder || "?"})
              </option>
            ))}
          </select>

          {/* View mode switcher */}
          <div className="inline-flex rounded-lg border border-[#E3E6EB] p-1 bg-[#F6F7F9]">
            <button
              onClick={() => setViewMode("badge")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === "badge"
                  ? "bg-[#2563EB] text-white shadow-sm"
                  : "text-[#5B6374] hover:text-[#091833]"
              }`}
            >
              VIP Security Pass
            </button>
            <button
              onClick={() => setViewMode("card")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === "card"
                  ? "bg-[#2563EB] text-white shadow-sm"
                  : "text-[#5B6374] hover:text-[#091833]"
              }`}
            >
              State Invitation Card
            </button>
            <button
              onClick={() => setViewMode("email")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === "email"
                  ? "bg-[#2563EB] text-white shadow-sm"
                  : "text-[#5B6374] hover:text-[#091833]"
              }`}
            >
              HTML Email Dispatch
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopySummary}
            className="bg-white border border-[#E3E6EB] hover:border-[#2563EB] text-[#091833] px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#5B6374]" />}
            <span>{copied ? "Copied" : "Copy Details"}</span>
          </button>
          <button
            onClick={handlePrint}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Pass</span>
          </button>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Live Field Customizer */}
        <div className="lg:col-span-5 bg-white p-6 rounded-xl border border-[#E3E6EB] shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#E3E6EB] pb-3">
            <h3 className="font-editorial text-base font-semibold text-[#091833]">
              Template Customizer
            </h3>
            <span className="text-[11px] text-[#5B6374] flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />
              Live Binding
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Title & Name */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="font-semibold text-[#5B6374] block mb-1">Title</label>
                <input
                  type="text"
                  value={formFields.guestTitle || ""}
                  onChange={(e) => setFormFields({ ...formFields, guestTitle: e.target.value })}
                  placeholder="Hon. / Dr."
                  className="w-full border border-[#E3E6EB] rounded-lg p-2.5 focus:outline-none focus:border-[#2563EB]"
                />
              </div>
              <div className="col-span-2">
                <label className="font-semibold text-[#5B6374] block mb-1">Full Name *</label>
                <input
                  type="text"
                  value={formFields.fullName}
                  onChange={(e) => setFormFields({ ...formFields, fullName: e.target.value })}
                  className="w-full border border-[#E3E6EB] rounded-lg p-2.5 focus:outline-none focus:border-[#2563EB] font-semibold"
                />
              </div>
            </div>

            {/* Company / Institution */}
            <div>
              <label className="font-semibold text-[#5B6374] block mb-1 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-[#2563EB]" />
                Company / Institution *
              </label>
              <input
                type="text"
                value={formFields.company}
                onChange={(e) => setFormFields({ ...formFields, company: e.target.value })}
                placeholder="e.g. British High Commission, Accra"
                className="w-full border border-[#E3E6EB] rounded-lg p-2.5 focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            {/* Designation */}
            <div>
              <label className="font-semibold text-[#5B6374] block mb-1">Designation / Role</label>
              <input
                type="text"
                value={formFields.designation || ""}
                onChange={(e) => setFormFields({ ...formFields, designation: e.target.value })}
                placeholder="e.g. High Commissioner, Presiding Bishop"
                className="w-full border border-[#E3E6EB] rounded-lg p-2.5 focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            {/* Rank Selection */}
            <div>
              <label className="font-semibold text-[#5B6374] block mb-1 flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-[#2563EB]" />
                Rank / Protocol Category *
              </label>
              <select
                value={
                  categories.find((c) => c.rankOrder === formFields.rankOrder)?.id || categories[0]?.id
                }
                onChange={(e) => handleRankChange(e.target.value)}
                className="w-full border border-[#E3E6EB] rounded-lg p-2.5 bg-white focus:outline-none focus:border-[#2563EB]"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    Rank {c.rankOrder}: {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Seat Reference & Section */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold text-[#5B6374] block mb-1 flex items-center gap-1">
                  <Armchair className="w-3.5 h-3.5 text-[#2563EB]" />
                  Seat Number / Ref *
                </label>
                <input
                  type="text"
                  value={formFields.seatReference || ""}
                  onChange={(e) => setFormFields({ ...formFields, seatReference: e.target.value })}
                  placeholder="e.g. SEC-A-R1-S01"
                  className="w-full font-mono font-semibold border border-[#E3E6EB] rounded-lg p-2.5 focus:outline-none focus:border-[#2563EB]"
                />
              </div>
              <div>
                <label className="font-semibold text-[#5B6374] block mb-1">Section</label>
                <input
                  type="text"
                  value={formFields.sectionName || ""}
                  onChange={(e) => setFormFields({ ...formFields, sectionName: e.target.value })}
                  placeholder="e.g. Section A (Leadership)"
                  className="w-full border border-[#E3E6EB] rounded-lg p-2.5 focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            {/* Security Ref & Event Venue */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold text-[#5B6374] block mb-1">Security Ref Code</label>
                <input
                  type="text"
                  value={formFields.invitationReference}
                  onChange={(e) =>
                    setFormFields({ ...formFields, invitationReference: e.target.value })
                  }
                  className="w-full font-mono border border-[#E3E6EB] rounded-lg p-2.5 focus:outline-none focus:border-[#2563EB]"
                />
              </div>
              <div>
                <label className="font-semibold text-[#5B6374] block mb-1">Venue</label>
                <input
                  type="text"
                  value={formFields.eventVenue}
                  onChange={(e) => setFormFields({ ...formFields, eventVenue: e.target.value })}
                  className="w-full border border-[#E3E6EB] rounded-lg p-2.5 focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>
          </div>

          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-lg text-xs text-[#1E3A8A] flex items-start gap-2">
            <Layers className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#2563EB]" />
            <span>
              All badges, cards, and email templates automatically dynamically pull the dignitary&apos;s <strong>Name</strong>, <strong>Company</strong>, <strong>Rank</strong>, and <strong>Seat Reference</strong>.
            </span>
          </div>
        </div>

        {/* Right Column: Interactive Live Preview */}
        <div className="lg:col-span-7 bg-[#F6F7F9] p-6 rounded-xl border border-[#E3E6EB] flex flex-col items-center justify-center min-h-[540px]">
          <div className="w-full flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-[#5B6374] uppercase tracking-wider">
              Live Preview &bull; {viewMode === "badge" ? "Security Badge (ID)" : viewMode === "card" ? "Diplomatic Card" : "Email Dispatch"}
            </span>
            <span className="text-[11px] text-[#2563EB] bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 font-semibold">
              Ready for Print &amp; Dispatch
            </span>
          </div>

          <PassTemplate data={formFields} viewMode={viewMode} />
        </div>
      </div>
    </div>
  );
}

