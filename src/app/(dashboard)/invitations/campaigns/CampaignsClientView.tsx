"use client";

import { useState } from "react";
import { Mail, Plus, Send, CheckCircle2, Clock, Eye, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";

export function CampaignsClientView({
  eventId,
  initialCampaigns,
  templates,
  categories,
}: {
  eventId: string;
  initialCampaigns: any[];
  templates: any[];
  categories: any[];
}) {
  const [campaigns, setCampaigns] = useState<any[]>(initialCampaigns);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "General Dignitary State Dispatch #1",
    senderName: "Office of the Rt. Hon. Speaker",
    senderEmail: "speaker-invitations@parliament.gh",
    replyToEmail: "protocol@parliament.gh",
    subjectSnapshot: "Official State Invitation: 2026 Festival of Nine Lessons and Carols - Parliament of Ghana",
    templateVersionId: templates[0]?.versions[0]?.id || "",
    categoryKey: "all",
  });

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/v1/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, eventId }),
      });
      const data = await res.json();
      if (data.data) {
        setCampaigns([data.data, ...campaigns]);
        setIsCreateOpen(false);
      }
    } catch (err) {
      console.error("Create campaign error:", err);
    }
  };

  const handleApprove = async (campaignId: string) => {
    try {
      const res = await fetch(`/api/v1/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json();
      if (data.data) {
        setCampaigns(campaigns.map((c) => (c.id === campaignId ? { ...c, status: "approved" } : c)));
      }
    } catch (err) {
      console.error("Approve error:", err);
    }
  };

  const handleDispatch = async (campaignId: string) => {
    setIsDispatching(true);
    try {
      const res = await fetch(`/api/v1/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispatch" }),
      });
      const data = await res.json();
      if (data.data) {
        // Refresh page to load sent invitations
        window.location.reload();
      }
    } catch (err) {
      console.error("Dispatch error:", err);
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-[#E4E7EC] shadow-sm">
        <div className="text-xs text-[#667085]">
          All campaigns enforce the strict Two-Person Rule: creation requires separate authorized Campaign Approver sign-off.
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="bg-[#102343] text-[#DFCA95] border border-[#C6A65B] hover:bg-[#C6A65B] hover:text-[#0A1830] transition-colors px-3.5 py-2 rounded-md text-xs font-bold flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create Invitation Campaign
        </button>
      </div>

      {/* Campaigns List */}
      <div className="space-y-4">
        {campaigns.length === 0 ? (
          <div className="bg-white border border-[#E4E7EC] rounded-lg p-8 text-center text-[#667085]">
            No campaigns created yet. Click "Create Invitation Campaign" above to begin.
          </div>
        ) : (
          campaigns.map((camp) => (
            <div
              key={camp.id}
              className="bg-white border border-[#E4E7EC] rounded-lg p-5 shadow-sm space-y-4 hover:border-[#C6A65B] transition-all"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#E4E7EC]">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-editorial text-base font-bold text-[#102343]">
                      {camp.name}
                    </h3>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        camp.status === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : camp.status === "approved"
                          ? "bg-blue-100 text-blue-800"
                          : camp.status === "sending"
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {camp.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-xs text-[#667085] mt-1">
                    Subject: <em>{camp.subjectSnapshot}</em>
                  </p>
                </div>

                {/* Campaign Actions */}
                <div className="flex items-center gap-2">
                  {camp.status === "pending_approval" && (
                    <button
                      onClick={() => handleApprove(camp.id)}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3 py-1.5 rounded transition-colors"
                    >
                      Approve for Dispatch
                    </button>
                  )}

                  {camp.status === "approved" && (
                    <button
                      onClick={() => handleDispatch(camp.id)}
                      disabled={isDispatching}
                      className="bg-[#C6A65B] hover:bg-[#DFCA95] text-[#0A1830] text-xs font-bold px-4 py-1.5 rounded transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      {isDispatching ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      Dispatch {camp.audienceCount} Invitations
                    </button>
                  )}

                  {camp.status === "completed" && (
                    <button
                      onClick={() => setSelectedCampaign(camp)}
                      className="bg-[#102343] text-[#DFCA95] hover:bg-[#C6A65B] hover:text-[#0A1830] text-xs font-bold px-3 py-1.5 rounded border border-[#C6A65B] transition-colors"
                    >
                      Inspect Recipient Activity ({camp.invitations?.length || 0})
                    </button>
                  )}
                </div>
              </div>

              {/* Campaign Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="bg-[#F7F5F0] p-2.5 rounded">
                  <span className="text-[10px] text-[#667085] uppercase block">Sender Identity</span>
                  <span className="font-semibold text-[#102343]">{camp.senderName}</span>
                </div>
                <div className="bg-[#F7F5F0] p-2.5 rounded">
                  <span className="text-[10px] text-[#667085] uppercase block">Audience Target</span>
                  <span className="font-semibold text-[#102343]">{camp.audienceCount} Dignitaries</span>
                </div>
                <div className="bg-[#F7F5F0] p-2.5 rounded">
                  <span className="text-[10px] text-[#667085] uppercase block">Approved By</span>
                  <span className="font-semibold text-[#102343]">
                    {camp.approver?.fullName || "Awaiting Sign-off"}
                  </span>
                </div>
                <div className="bg-[#F7F5F0] p-2.5 rounded">
                  <span className="text-[10px] text-[#667085] uppercase block">Template Snapshot</span>
                  <span className="font-semibold text-[#102343]">
                    {camp.templateVersion?.template?.name || "State Template"} (v1)
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Recipient Activity Detail Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-[#C6A65B] max-w-4xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="border-b border-[#E4E7EC] pb-3 flex items-center justify-between">
              <div>
                <h3 className="font-editorial text-lg font-bold text-[#102343]">
                  Recipient Activity Timeline: {selectedCampaign.name}
                </h3>
                <p className="text-xs text-[#667085]">
                  Reconciliation of individual delivery, bounce, open signals, and link access.
                </p>
              </div>
              <button
                onClick={() => setSelectedCampaign(null)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {selectedCampaign.invitations?.map((inv: any) => {
                const latestAttempt = inv.emailAttempts[0];
                const latestRsvp = inv.rsvps[0];
                const events = inv.invitationEvents || [];

                return (
                  <div
                    key={inv.id}
                    className="border border-[#E4E7EC] rounded-md p-3 text-xs bg-[#F7F5F0]/30 hover:bg-[#F7F5F0] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold text-[#102343]">
                        {inv.eventGuest.person.title} {inv.recipientNameSnapshot}
                      </div>
                      <div className="text-[11px] text-[#667085]">
                        {inv.recipientEmailSnapshot} &bull; Ref: {inv.invitationReference}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Delivered
                      </span>

                      {events.some((e: any) => e.eventType === "open_signal") && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                          Open Signal
                        </span>
                      )}

                      {events.some((e: any) => e.eventType === "link_access") && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                          Link Accessed
                        </span>
                      )}

                      {latestRsvp?.response === "accepted" ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-700 text-white">
                          RSVP: Accepted
                        </span>
                      ) : latestRsvp?.response === "declined" ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-700 text-white">
                          RSVP: Declined
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                          RSVP: Pending
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-[#E4E7EC] flex justify-end">
              <button
                onClick={() => setSelectedCampaign(null)}
                className="px-4 py-2 bg-[#102343] text-white text-xs font-bold rounded"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-[#C6A65B] max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="border-b border-[#E4E7EC] pb-3 flex items-center justify-between">
              <h3 className="font-editorial text-lg font-bold text-[#102343]">
                Create Formal Invitation Campaign
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Campaign Title *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-[#E4E7EC] rounded p-2"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Sender Name (Institution) *</label>
                <input
                  type="text"
                  required
                  value={formData.senderName}
                  onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                  className="w-full border border-[#E4E7EC] rounded p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Sender Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.senderEmail}
                    onChange={(e) => setFormData({ ...formData, senderEmail: e.target.value })}
                    className="w-full border border-[#E4E7EC] rounded p-2"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Reply-To Email</label>
                  <input
                    type="email"
                    value={formData.replyToEmail}
                    onChange={(e) => setFormData({ ...formData, replyToEmail: e.target.value })}
                    className="w-full border border-[#E4E7EC] rounded p-2"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Audience Protocol Filter</label>
                <select
                  value={formData.categoryKey}
                  onChange={(e) => setFormData({ ...formData, categoryKey: e.target.value })}
                  className="w-full border border-[#E4E7EC] rounded p-2 bg-white"
                >
                  <option value="all">All Dignitaries (Full Protocol Roster)</option>
                  {categories.map((c) => (
                    <option key={c.categoryKey} value={c.categoryKey}>
                      Rank {c.rankOrder}: {c.name.slice(0, 35)}...
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-[#E4E7EC] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3 py-2 border rounded text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#102343] text-[#DFCA95] font-bold rounded hover:bg-[#C6A65B] hover:text-[#0A1830] transition-colors"
                >
                  Submit for Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
