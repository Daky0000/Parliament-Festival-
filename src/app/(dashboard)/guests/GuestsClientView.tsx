"use client";

import { useState } from "react";
import { Search, Plus, Filter, CheckCircle, Clock, XCircle, Armchair, Mail } from "lucide-react";

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

export function GuestsClientView({
  eventId,
  initialGuests,
  categories,
}: {
  eventId: string;
  initialGuests: any[];
  categories: CategoryItem[];
}) {
  const [guests, setGuests] = useState<GuestItem[]>(initialGuests);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedRsvp, setSelectedRsvp] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    title: "Hon.",
    fullName: "",
    designation: "",
    institutionName: "",
    email: "",
    phone: "",
    protocolCategoryId: categories[0]?.id || "",
    companionAllowance: 1,
  });

  const filteredGuests = guests.filter((g) => {
    const matchesSearch =
      searchQuery === "" ||
      g.person.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.institution?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.person.email?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" || g.protocolCategory?.id === selectedCategory;

    const latestRsvp = g.invitations[0]?.rsvps[0]?.response || "pending";
    const matchesRsvp = selectedRsvp === "all" || latestRsvp === selectedRsvp;

    return matchesSearch && matchesCategory && matchesRsvp;
  });

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName) return;

    try {
      const res = await fetch("/api/v1/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, eventId }),
      });
      const data = await res.json();
      if (data.data) {
        setGuests([data.data, ...guests]);
        setIsModalOpen(false);
        setFormData({
          title: "Hon.",
          fullName: "",
          designation: "",
          institutionName: "",
          email: "",
          phone: "",
          protocolCategoryId: categories[0]?.id || "",
          companionAllowance: 1,
        });
      }
    } catch (err) {
      console.error("Error creating guest:", err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="bg-white p-4 rounded-lg border border-[#E4E7EC] flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-[#667085] absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by name, institution, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-[#E4E7EC] rounded-md focus:outline-none focus:border-[#C6A65B]"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs border border-[#E4E7EC] rounded-md px-3 py-2 bg-white text-[#202A38] focus:outline-none focus:border-[#C6A65B]"
          >
            <option value="all">All Protocol Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                Rank {c.rankOrder}: {c.name.slice(0, 35)}...
              </option>
            ))}
          </select>

          <select
            value={selectedRsvp}
            onChange={(e) => setSelectedRsvp(e.target.value)}
            className="text-xs border border-[#E4E7EC] rounded-md px-3 py-2 bg-white text-[#202A38] focus:outline-none focus:border-[#C6A65B]"
          >
            <option value="all">All RSVP Responses</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-[#102343] text-[#DFCA95] border border-[#C6A65B] hover:bg-[#C6A65B] hover:text-[#0A1830] transition-colors px-3.5 py-2 rounded-md text-xs font-bold flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Dignitary
        </button>
      </div>

      {/* Responsive Table */}
      <div className="bg-white rounded-lg border border-[#E4E7EC] shadow-sm overflow-hidden">
        <div className="table-responsive-container">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#0A1830] text-[#F7F5F0]">
              <tr>
                <th className="p-3 text-[11px] font-bold uppercase tracking-wider text-[#C6A65B]">
                  Dignitary & Institution
                </th>
                <th className="p-3 text-[11px] font-bold uppercase tracking-wider text-[#C6A65B]">
                  Protocol Category
                </th>
                <th className="p-3 text-[11px] font-bold uppercase tracking-wider text-[#C6A65B]">
                  Contact
                </th>
                <th className="p-3 text-[11px] font-bold uppercase tracking-wider text-[#C6A65B]">
                  RSVP Status
                </th>
                <th className="p-3 text-[11px] font-bold uppercase tracking-wider text-[#C6A65B]">
                  Seating
                </th>
                <th className="p-3 text-[11px] font-bold uppercase tracking-wider text-[#C6A65B]">
                  Ref
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EC] text-xs">
              {filteredGuests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[#667085]">
                    No dignitaries match the current filters.
                  </td>
                </tr>
              ) : (
                filteredGuests.map((guest) => {
                  const latestRsvp = guest.invitations[0]?.rsvps[0];
                  const seatAssignment = guest.seatAssignments[0];

                  return (
                    <tr key={guest.id} className="hover:bg-[#F7F5F0]/60 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-[#102343]">
                          {guest.person.title} {guest.person.fullName}
                        </div>
                        <div className="text-[11px] text-[#667085]">
                          {guest.person.designation} &bull; {guest.institution?.name}
                        </div>
                      </td>

                      <td className="p-3">
                        {guest.protocolCategory ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: guest.protocolCategory.colourHex }}
                            ></span>
                            <span className="font-semibold text-[#202A38]">
                              Rank {guest.protocolCategory.rankOrder}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#B42318] italic">Unranked</span>
                        )}
                      </td>

                      <td className="p-3 text-[11px]">
                        <div>{guest.person.email || "No email"}</div>
                        <div className="text-[#667085]">{guest.person.phone || "No phone"}</div>
                      </td>

                      <td className="p-3">
                        {latestRsvp?.response === "accepted" ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            Confirmed (+{latestRsvp.companionCount})
                          </span>
                        ) : latestRsvp?.response === "declined" ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            Declined
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Pending
                          </span>
                        )}
                      </td>

                      <td className="p-3">
                        {seatAssignment ? (
                          <div className="flex items-center gap-1.5 font-medium text-[#102343]">
                            <Armchair className="w-3.5 h-3.5 text-[#C6A65B]" />
                            <span>
                              {seatAssignment.section.name.split(" ")[0]} -{" "}
                              {seatAssignment.seat?.seatCode || "Block"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#667085] italic">Unassigned</span>
                        )}
                      </td>

                      <td className="p-3 font-mono text-[11px] text-[#667085]">
                        {guest.guestReference}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Dignitary Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-[#C6A65B] max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="border-b border-[#E4E7EC] pb-3 flex items-center justify-between">
              <h3 className="font-editorial text-lg font-bold text-[#102343]">
                Add Dignitary to Protocol Register
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddGuest} className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full border border-[#E4E7EC] rounded p-2"
                  />
                </div>
                <div className="col-span-2">
                  <label className="font-semibold block mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full border border-[#E4E7EC] rounded p-2"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Designation</label>
                <input
                  type="text"
                  placeholder="e.g. High Commissioner, Presiding Bishop"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  className="w-full border border-[#E4E7EC] rounded p-2"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Institution</label>
                <input
                  type="text"
                  placeholder="e.g. Embassy of Ghana, Judicial Service"
                  value={formData.institutionName}
                  onChange={(e) => setFormData({ ...formData, institutionName: e.target.value })}
                  className="w-full border border-[#E4E7EC] rounded p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full border border-[#E4E7EC] rounded p-2"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Phone</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full border border-[#E4E7EC] rounded p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Protocol Category</label>
                  <select
                    value={formData.protocolCategoryId}
                    onChange={(e) => setFormData({ ...formData, protocolCategoryId: e.target.value })}
                    className="w-full border border-[#E4E7EC] rounded p-2 bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        Rank {c.rankOrder}: {c.name.slice(0, 20)}...
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Companion Allowance</label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={formData.companionAllowance}
                    onChange={(e) =>
                      setFormData({ ...formData, companionAllowance: parseInt(e.target.value) || 0 })
                    }
                    className="w-full border border-[#E4E7EC] rounded p-2"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#E4E7EC] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-2 border rounded text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#102343] text-[#DFCA95] font-bold rounded hover:bg-[#C6A65B] hover:text-[#0A1830] transition-colors"
                >
                  Save Dignitary
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

