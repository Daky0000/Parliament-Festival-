"use client";

import { useState } from "react";
import { Armchair, Sparkles, AlertTriangle, CheckCircle, ShieldCheck, RefreshCw, UserCheck } from "lucide-react";

export function SeatingPlannerClientView({
  eventId,
  seatingPlan,
  confirmedGuests,
  categories,
}: {
  eventId: string;
  seatingPlan: any;
  confirmedGuests: any[];
  categories: any[];
}) {
  const [currentPlan, setCurrentPlan] = useState<any>(seatingPlan);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    seatingPlan.sections[0]?.id || ""
  );
  const [isAllocating, setIsAllocating] = useState(false);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [allocationNotice, setAllocationNotice] = useState<string | null>(null);

  const selectedSection = currentPlan.sections.find(
    (s: any) => s.id === selectedSectionId
  );

  const handleRunSeatingEngine = async () => {
    setIsAllocating(true);
    setAllocationNotice(null);
    try {
      const res = await fetch("/api/v1/seating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "auto_allocate",
          eventId,
          seatingPlanId: currentPlan.id,
        }),
      });
      const data = await res.json();
      if (data.data) {
        setConflicts(data.data.conflicts || []);
        setAllocationNotice(
          `Successfully allocated ${data.data.assignedCount} confirmed dignitaries according to protocol rank rules.`
        );
        // Refresh local view
        window.location.reload();
      }
    } catch (err) {
      console.error("Allocation error:", err);
    } finally {
      setIsAllocating(false);
    }
  };

  const handleApprovePlan = async () => {
    try {
      const res = await fetch("/api/v1/seating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_plan",
          eventId,
          seatingPlanId: currentPlan.id,
        }),
      });
      const data = await res.json();
      if (data.data) {
        setCurrentPlan({ ...currentPlan, status: "approved" });
      }
    } catch (err) {
      console.error("Approve plan error:", err);
    }
  };

  const totalSeatsAssigned = currentPlan.sections.reduce(
    (acc: number, s: any) => acc + (s.seatAssignments?.length || 0),
    0
  );
  const totalCapacity = currentPlan.sections.reduce(
    (acc: number, s: any) => acc + s.capacity,
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="bg-white p-4 rounded-lg border border-[#E3E6EB] flex flex-wrap items-center justify-between gap-4 ">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-[#091833]">
              {currentPlan.name}
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider ${
                currentPlan.status === "approved"
                  ? "bg-[#EEF6DC] text-[#3F6212]"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {currentPlan.status}
            </span>
          </div>
          <p className="text-xs text-[#5B6374] mt-0.5">
            Total Allocated: {totalSeatsAssigned} / {totalCapacity} seats across 5 sections.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRunSeatingEngine}
            disabled={isAllocating}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
          >
            {isAllocating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Run Protocol Seating Engine
          </button>

          {currentPlan.status !== "approved" && (
            <button
              onClick={handleApprovePlan}
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-4 py-2 rounded-md flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Approve & Lock Plan
            </button>
          )}
        </div>
      </div>

      {allocationNotice && (
        <div className="bg-[#EEF6DC] border border-[#D9E8B8] text-[#3F6212] p-3 rounded-md text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-[#3F6212] flex-shrink-0" />
          <span>{allocationNotice}</span>
        </div>
      )}

      {/* Forecourt Venue Sections Map */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {currentPlan.sections.map((section: any) => {
          const isSelected = section.id === selectedSectionId;
          const assignedCount = section.seatAssignments?.length || 0;
          const utilizationPct = Math.round((assignedCount / section.capacity) * 100);

          return (
            <div
              key={section.id}
              onClick={() => setSelectedSectionId(section.id)}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                isSelected
                  ? "bg-[#091833] text-white border-[#2563EB] ring-2 ring-[#2563EB]/30"
                  : "bg-white text-[#0D1526] border-[#E3E6EB] hover:border-[#2563EB]"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: section.colourHex }}
                ></span>
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    isSelected ? "bg-[#091833] text-[#8FB2FF]" : "bg-[#F6F7F9] text-[#5B6374]"
                  }`}
                >
                  {section.sectionCode}
                </span>
              </div>

              <h4 className="font-editorial font-medium text-xs line-clamp-1 mb-1">
                {section.name}
              </h4>

              <div className="space-y-1.5 mt-3">
                <div className="flex justify-between text-[11px] font-semibold">
                  <span className={isSelected ? "text-[#8FB2FF]" : "text-[#5B6374]"}>
                    Utilization
                  </span>
                  <span>
                    {assignedCount} / {section.capacity}
                  </span>
                </div>
                <div className="w-full bg-gray-200/40 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(utilizationPct, 100)}%`,
                      backgroundColor: section.colourHex || "#2563EB",
                    }}
                  ></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Section Seats and Attendees View */}
      {selectedSection && (
        <div className="bg-white rounded-lg border border-[#E3E6EB] p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E3E6EB] gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: selectedSection.colourHex }}
                ></span>
                <h3 className="font-editorial text-base font-medium text-[#091833]">
                  {selectedSection.name}
                </h3>
              </div>
              <p className="text-xs text-[#5B6374] mt-0.5">
                Eligible Protocol Rank:{" "}
                <strong>{selectedSection.protocolCategory?.name || "General"}</strong> &bull; Capacity:{" "}
                <strong>{selectedSection.capacity} seats</strong>
              </p>
            </div>
            <div className="text-xs font-semibold text-[#091833] bg-[#F6F7F9] px-3 py-1.5 rounded border border-[#E3E6EB]">
              {selectedSection.seatAssignments?.length || 0} Dignitaries Allocated
            </div>
          </div>

          {/* Seat Grid / Dignitary Allocations List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {selectedSection.seatAssignments?.length === 0 ? (
              <div className="col-span-3 p-8 text-center text-[#5B6374] text-xs">
                No dignitaries allocated to this section yet. Click &ldquo;Run Protocol Seating Engine&rdquo; above to allocate based on official rank.
              </div>
            ) : (
              selectedSection.seatAssignments.map((assignment: any) => (
                <div
                  key={assignment.id}
                  className="border border-[#E3E6EB] rounded-md p-3 text-xs bg-[#F6F7F9]/40 flex items-start gap-3 hover:border-[#2563EB] transition-colors"
                >
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center font-semibold text-white text-xs flex-shrink-0 mt-0.5 "
                    style={{ backgroundColor: selectedSection.colourHex }}
                  >
                    <Armchair className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[#091833] truncate">
                      {assignment.eventGuest.person.title} {assignment.eventGuest.person.fullName}
                    </div>
                    <div className="text-[11px] text-[#5B6374] truncate">
                      {assignment.eventGuest.person.designation}
                    </div>
                    <div className="text-[10px] text-[#2563EB] font-semibold mt-1">
                      Seat: {assignment.seat?.seatCode || "Unnumbered VIP Block"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

