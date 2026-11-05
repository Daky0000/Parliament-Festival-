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

  const [actionError, setActionError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, Record<string, number>>>({});

  async function campaignAction(campaignId: string, action: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return null;
    setActionError(null);
    const res = await fetch(`/api/v1/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionError(data?.error || "The action failed.");
      return null;
    }
    if (data?.data?.progress) setProgress((p) => ({ ...p, [campaignId]: data.data.progress }));
    return data;
  }

  async function refreshProgress(campaignId: string) {
    const res = await fetch(`/api/v1/campaigns/${campaignId}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setProgress((p) => ({ ...p, [campaignId]: data.data.progress }));
      setCampaigns(campaigns.map((c) => (c.id === campaignId ? { ...c, status: data.data.status } : c)));
    }
  }

  const handleApprove = async (campaignId: string) => {
    const data = await campaignAction(campaignId, "approve");
    if (data?.data) setCampaigns(campaigns.map((c) => (c.id === campaignId ? { ...c, status: "approved" } : c)));
  };

  const handleControl = async (campaignId: string, action: "pause" | "resume" | "cancel" | "retry_failed") => {
    const statusAfter = { pause: "paused", resume: "sending", cancel: "cancelled", retry_failed: "sending" }[action];
    const data = await campaignAction(
      campaignId,
      action,
      action === "cancel" ? "Cancel this campaign? Recipients not yet sent will not receive it." : undefined
    );
    if (data) setCampaigns(campaigns.map((c) => (c.id === campaignId ? { ...c, status: statusAfter } : c)));
  };

  const handleDispatch = async (campaignId: string) => {
    setIsDispatching(true);
    try {
      // Sending happens in the background queue; this only starts it.
      const data = await campaignAction(campaignId, "dispatch", "Start sending this campaign now?");
      if (data) setCampaigns(campaigns.map((c) => (c.id === campaignId ? { ...c, status: "sending" } : c)));
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="space-y-6">
      {actionError && (
        <p role="alert" className="text-[14px] text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-[10px] px-3 py-2">{actionError}</p>
      )}
      {/* Top Bar */}
      <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-[#E3E6EB] ">
        <div className="text-xs text-[#5B6374]">
          All campaigns enforce the strict Two-Person Rule: creation requires separate authorized Campaign Approver sign-off.
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Invitation Campaign
        </button>
      </div>

      {/* Campaigns List */}
      <div className="space-y-4">
        {campaigns.length === 0 ? (
          <div className="bg-white border border-[#E3E6EB] rounded-lg p-8 text-center text-[#5B6374]">
            No campaigns created yet. Click &ldquo;Create Invitation Campaign&rdquo; above to begin.
          </div>
        ) : (
          campaigns.map((camp) => (
            <div
              key={camp.id}
              className="bg-white border border-[#E3E6EB] rounded-lg p-5 space-y-4 hover:border-[#2563EB] transition-all"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#E3E6EB]">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-editorial text-base font-medium text-[#091833]">
                      {camp.name}
                    </h3>
                    <span
                      className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        camp.status === "completed"
                          ? "bg-[#EEF6DC] text-[#3F6212]"
                          : camp.status === "approved"
                          ? "bg-[#EAF1FF] text-[#2563EB]"
                          : camp.status === "sending"
                          ? "bg-[#EAF1FF] text-[#2563EB]"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {camp.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-xs text-[#5B6374] mt-1">
                    Subject: <em>{camp.subjectSnapshot}</em>
                  </p>
                </div>

                {/* Campaign Actions */}
                <div className="flex items-center gap-2">
                  {camp.status === "pending_approval" && (
                    <button
                      onClick={() => handleApprove(camp.id)}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors"
                    >
                      Approve for Dispatch
                    </button>
                  )}

                  {camp.status === "approved" && (
                    <button
                      onClick={() => handleDispatch(camp.id)}
                      disabled={isDispatching}
                      className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold px-4 py-1.5 rounded transition-colors flex items-center gap-1.5 "
                    >
                      {isDispatching ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      Dispatch {camp.audienceCount} Invitations
                    </button>
                  )}

                  {(camp.status === "sending" || camp.status === "paused" || camp.status === "completed") && (
                    <button
                      onClick={() => refreshProgress(camp.id)}
                      className="bg-white border border-[#E3E6EB] text-[#091833] text-xs font-semibold px-3 py-1.5 rounded"
                    >
                      Refresh progress
                    </button>
                  )}
                  {camp.status === "sending" && (
                    <button onClick={() => handleControl(camp.id, "pause")} className="bg-white border border-[#E3E6EB] text-[#091833] text-xs font-semibold px-3 py-1.5 rounded">Pause</button>
                  )}
                  {camp.status === "paused" && (
                    <button onClick={() => handleControl(camp.id, "resume")} className="bg-[#2563EB] text-white text-xs font-semibold px-3 py-1.5 rounded">Resume</button>
                  )}
                  {(camp.status === "sending" || camp.status === "paused" || camp.status === "approved") && (
                    <button onClick={() => handleControl(camp.id, "cancel")} className="bg-white border border-[#FECDCA] text-[#B42318] text-xs font-semibold px-3 py-1.5 rounded">Cancel</button>
                  )}
                  {camp.status === "completed" && (progress[camp.id]?.failed ?? 0) > 0 && (
                    <button onClick={() => handleControl(camp.id, "retry_failed")} className="bg-white border border-[#E3E6EB] text-[#091833] text-xs font-semibold px-3 py-1.5 rounded">Retry failed</button>
                  )}
                  {camp.status === "completed" && (
                    <button
                      onClick={() => setSelectedCampaign(camp)}
                      className="bg-white border border-[#E3E6EB] hover:border-[#2563EB] text-[#091833] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                    >
                      Inspect Recipient Activity ({camp.invitations?.length || 0})
                    </button>
                  )}
                </div>
              </div>

              {progress[camp.id] && (
                <div className="flex flex-wrap gap-2 text-[11px]" aria-label="Delivery progress">
                  {Object.entries(progress[camp.id]).filter(([, n]) => n > 0).map(([k, n]) => (
                    <span key={k} className="bg-[#F6F7F9] border border-[#E3E6EB] rounded px-2 py-1">
                      {k === "accepted" ? "accepted by provider" : k}: <strong>{n}</strong>
                    </span>
                  ))}
                </div>
              )}

              {/* Campaign Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="bg-[#F6F7F9] p-2.5 rounded">
                  <span className="text-[10px] text-[#5B6374] uppercase block">Sender Identity</span>
                  <span className="font-semibold text-[#091833]">{camp.senderName}</span>
                </div>
                <div className="bg-[#F6F7F9] p-2.5 rounded">
                  <span className="text-[10px] text-[#5B6374] uppercase block">Audience Target</span>
                  <span className="font-semibold text-[#091833]">{camp.audienceCount} Dignitaries</span>
                </div>
                <div className="bg-[#F6F7F9] p-2.5 rounded">
                  <span className="text-[10px] text-[#5B6374] uppercase block">Approved By</span>
                  <span className="font-semibold text-[#091833]">
                    {camp.approver?.fullName || "Awaiting Sign-off"}
                  </span>
                </div>
                <div className="bg-[#F6F7F9] p-2.5 rounded">
                  <span className="text-[10px] text-[#5B6374] uppercase block">Template Snapshot</span>
                  <span className="font-semibold text-[#091833]">
                    {camp.templateVersion?.template?.name || "State Template"} (v{camp.templateVersion?.versionNumber ?? 1})
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
          <div className="bg-white rounded-lg border border-[#2563EB] max-w-4xl w-full p-6 shadow-float space-y-4 max-h-[85vh] flex flex-col">
            <div className="border-b border-[#E3E6EB] pb-3 flex items-center justify-between">
              <div>
                <h3 className="font-editorial text-lg font-medium text-[#091833]">
                  Recipient Activity Timeline: {selectedCampaign.name}
                </h3>
                <p className="text-xs text-[#5B6374]">
                  Reconciliation of individual delivery, bounce, open signals, and link access.
                </p>
              </div>
              <button
                onClick={() => setSelectedCampaign(null)}
                className="text-[#8A91A0] hover:text-[#5B6374] text-sm font-semibold"
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
                    className="border border-[#E3E6EB] rounded-md p-3 text-xs bg-[#F6F7F9]/30 hover:bg-[#F6F7F9] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-semibold text-[#091833]">
                        {inv.eventGuest.person.title} {inv.recipientNameSnapshot}
                      </div>
                      <div className="text-[11px] text-[#5B6374]">
                        {inv.recipientEmailSnapshot} &bull; Ref: {inv.invitationReference}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EEF6DC] text-[#3F6212]">
                        Delivered
                      </span>

                      {events.some((e: any) => e.eventType === "open_signal") && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EAF1FF] text-[#2563EB]">
                          Open Signal
                        </span>
                      )}

                      {events.some((e: any) => e.eventType === "link_access") && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EAF1FF] text-[#2563EB]">
                          Link Accessed
                        </span>
                      )}

                      {latestRsvp?.response === "accepted" ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-700 text-white">
                          RSVP: Accepted
                        </span>
                      ) : latestRsvp?.response === "declined" ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-700 text-white">
                          RSVP: Declined
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                          RSVP: Pending
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-[#E3E6EB] flex justify-end">
              <button
                onClick={() => setSelectedCampaign(null)}
                className="px-4 py-2 bg-[#091833] text-white text-xs font-semibold rounded"
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
          <div className="bg-white rounded-lg border border-[#2563EB] max-w-lg w-full p-6 shadow-float space-y-4">
            <div className="border-b border-[#E3E6EB] pb-3 flex items-center justify-between">
              <h3 className="font-editorial text-lg font-medium text-[#091833]">
                Create Formal Invitation Campaign
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-[#8A91A0] hover:text-[#5B6374] text-sm font-semibold"
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
                  className="w-full border border-[#E3E6EB] rounded p-2"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Sender Name (Institution) *</label>
                <input
                  type="text"
                  required
                  value={formData.senderName}
                  onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                  className="w-full border border-[#E3E6EB] rounded p-2"
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
                    className="w-full border border-[#E3E6EB] rounded p-2"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Reply-To Email</label>
                  <input
                    type="email"
                    value={formData.replyToEmail}
                    onChange={(e) => setFormData({ ...formData, replyToEmail: e.target.value })}
                    className="w-full border border-[#E3E6EB] rounded p-2"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Audience Protocol Filter</label>
                <select
                  value={formData.categoryKey}
                  onChange={(e) => setFormData({ ...formData, categoryKey: e.target.value })}
                  className="w-full border border-[#E3E6EB] rounded p-2 bg-white"
                >
                  <option value="all">All Dignitaries (Full Protocol Roster)</option>
                  {categories.map((c) => (
                    <option key={c.categoryKey} value={c.categoryKey}>
                      Rank {c.rankOrder}: {c.name.slice(0, 35)}...
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-[#E3E6EB] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3 py-2 border rounded text-[#5B6374] hover:bg-[#F6F7F9]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold rounded-lg text-xs shadow-sm transition-colors"
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

