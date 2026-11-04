"use client";

import { useState } from "react";
import { MessageSquare, Power, Send, CheckCircle, AlertTriangle, ExternalLink, RefreshCw, Key, ShieldCheck } from "lucide-react";
import { normalizeGhanaPhone, calculateSmsSegments } from "@/lib/sms/vynfy";
import { EditKeyModal } from "@/components/super-admin/EditKeyModal";

export function VynfySmsClientView({
  integration: initialIntegration,
  initialMessages,
  totalCount,
}: {
  integration: any;
  initialMessages: any[];
  totalCount: number;
}) {
  const [integration, setIntegration] = useState(initialIntegration);
  const [messages, setMessages] = useState<any[]>(initialMessages);
  const [testPhone, setTestPhone] = useState("0244123456");
  const [testMessage, setTestMessage] = useState(
    "Parliament of Ghana: You are cordially invited to the 2026 Festival of Nine Lessons and Carols. Ref: GH-CAROLS-7842"
  );
  const [isSending, setIsSending] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [isEnabled, setIsEnabled] = useState(initialIntegration?.isEnabled ?? true);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<string | null>(null);

  const normalizedPreview = normalizeGhanaPhone(testPhone);
  const segments = calculateSmsSegments(testMessage);

  const meta = (() => {
    try {
      return JSON.parse(integration?.metadata || "{}");
    } catch (e) {
      return {};
    }
  })();

  const handleVerifyGateway = async () => {
    setIsVerifying(true);
    setVerifyStatus(null);
    try {
      const res = await fetch("/api/v1/super-admin/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerKey: "vynfy" }),
      });
      const data = await res.json();
      if (data.data?.result === "success") {
        setVerifyStatus(data.data.details || "Vynfy SMS Gateway operational.");
      } else {
        setVerifyStatus(`Verification notice: ${data.data?.error || data.error}`);
      }
    } catch (err: any) {
      setVerifyStatus(`Verification error: ${err.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleKeyUpdated = (providerKey: string, newHint: string, updatedMetadata?: string) => {
    const nextCreds = [{ maskedHint: newHint, status: "active" }];
    setIntegration({
      ...integration,
      credentials: nextCreds,
      metadata: updatedMetadata || integration.metadata,
    });
    handleVerifyGateway();
  };

  const handleSendTestSms = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/v1/super-admin/sms/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: testPhone,
          message: testMessage,
          senderId: meta.senderId || "PARLIAMENT",
        }),
      });

      const data = await res.json();
      if (data.data) {
        setTestResult(data.data);
        setMessages([
          {
            id: data.data.messageId,
            channel: "sms",
            provider: "vynfy",
            recipientSnapshot: data.data.normalizedPhone,
            bodySnippet: testMessage.slice(0, 100),
            providerMessageId: data.data.providerMessageId,
            status: data.data.status,
            createdAt: new Date(),
          },
          ...messages,
        ]);
      } else {
        alert(data.error || "SMS send failed");
      }
    } catch (err) {
      console.error("Test SMS error:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleKillSwitch = async () => {
    try {
      const res = await fetch("/api/v1/super-admin/integrations/vynfy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !isEnabled }),
      });
      const data = await res.json();
      if (data.data) {
        setIsEnabled(!isEnabled);
      }
    } catch (err) {
      console.error("Kill switch error:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Configuration & Kill Switch Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0D1C38] border border-[#C6A65B]/30 rounded-xl p-5 space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#DFCA95]/60 uppercase font-mono">Gateway Credential</span>
            <button
              onClick={() => setIsEditingKey(true)}
              className="bg-[#C6A65B] hover:bg-[#DFCA95] text-[#0A1830] font-bold text-[11px] px-2.5 py-1 rounded transition-colors flex items-center gap-1 shadow"
            >
              <Key className="w-3 h-3" />
              <span>Edit Key</span>
            </button>
          </div>
          <div className="text-sm font-bold text-white font-mono">
            {integration?.credentials?.[0]?.maskedHint || "df4b...1109"}
          </div>
          <div className="flex items-center justify-between pt-1 text-[11px] text-[#DFCA95]/80">
            <div>
              Sender ID: <strong className="text-[#C6A65B]">{meta.senderId || "PARLIAMENT"}</strong>
            </div>
            <button
              onClick={handleVerifyGateway}
              disabled={isVerifying}
              className="text-[#DFCA95] hover:text-white underline flex items-center gap-1"
            >
              {isVerifying ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Verify"}
            </button>
          </div>
        </div>

        <div className="bg-[#0D1C38] border border-[#C6A65B]/30 rounded-xl p-5 space-y-2 shadow-lg">
          <div className="text-[10px] text-[#DFCA95]/60 uppercase font-mono">Account Balance Estimate</div>
          <div className="text-xl font-bold text-emerald-400">GHS 4,850.00</div>
          <div className="text-[11px] text-[#DFCA95]/80">
            Estimated Units: ~121,250 SMS segments
          </div>
        </div>

        {/* Emergency Kill Switch Card */}
        <div
          className={`border rounded-xl p-5 space-y-3 shadow-lg flex flex-col justify-between ${
            isEnabled
              ? "bg-[#0D1C38] border-[#C6A65B]/30"
              : "bg-rose-950/40 border-rose-500/60"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-[#DFCA95]/60 uppercase font-mono">Emergency Kill Switch</div>
            <span
              className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${
                isEnabled ? "bg-emerald-950 text-emerald-400" : "bg-rose-900 text-white animate-pulse"
              }`}
            >
              {isEnabled ? "Armed / Operational" : "BLOCKED"}
            </span>
          </div>

          <button
            onClick={handleToggleKillSwitch}
            className={`w-full py-2 px-3 rounded text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
              isEnabled
                ? "bg-rose-950/80 text-rose-300 hover:bg-rose-900 border border-rose-500/40"
                : "bg-emerald-700 hover:bg-emerald-800 text-white"
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{isEnabled ? "Activate Emergency Kill Switch" : "Deactivate Kill Switch"}</span>
          </button>
        </div>
      </div>

      {verifyStatus && (
        <div className="p-3 bg-[#102343] border border-[#C6A65B]/40 rounded-lg text-xs text-[#DFCA95] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#C6A65B] shrink-0" />
          <span>{verifyStatus}</span>
        </div>
      )}

      {/* Test Dispatcher Form */}
      <div className="bg-[#0D1C38] border border-[#C6A65B]/30 rounded-xl p-6 shadow-lg space-y-4">
        <div className="border-b border-[#C6A65B]/20 pb-3 flex items-center justify-between">
          <div>
            <h3 className="font-editorial text-sm font-bold text-white uppercase tracking-wider">
              Vynfy Gateway Delivery Verification Test
            </h3>
            <p className="text-xs text-[#DFCA95]/70">
              Dispatches a test state notification over the Vynfy SMS Gateway with automatic Ghana E.164 normalization.
            </p>
          </div>
          <span className="text-[10px] bg-[#102343] text-[#C6A65B] px-2.5 py-1 rounded border border-[#C6A65B]/30 font-mono">
            Provider: Vynfy
          </span>
        </div>

        <form onSubmit={handleSendTestSms} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold text-white block mb-1">
                Recipient Phone Number (Ghana / International)
              </label>
              <input
                type="text"
                required
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="w-full bg-[#070D18] border border-[#C6A65B]/30 rounded p-2.5 text-white font-mono focus:outline-none focus:border-[#C6A65B]"
              />
              <div className="mt-1 text-[11px] text-[#DFCA95]/70 flex items-center justify-between">
                <span>Normalized E.164: <code className="text-[#C6A65B] font-bold">{normalizedPreview}</code></span>
                <span>Sender: <strong className="text-white">{meta.senderId || "PARLIAMENT"}</strong></span>
              </div>
            </div>

            <div>
              <label className="font-semibold text-white block mb-1">
                Message Content ({testMessage.length} chars, {segments} segment{segments > 1 ? "s" : ""})
              </label>
              <textarea
                rows={3}
                required
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="w-full bg-[#070D18] border border-[#C6A65B]/30 rounded p-2.5 text-white font-mono focus:outline-none focus:border-[#C6A65B]"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-[#C6A65B]/20">
            <button
              type="submit"
              disabled={isSending || !isEnabled}
              className="bg-[#C6A65B] hover:bg-[#DFCA95] text-[#0A1830] font-bold px-5 py-2.5 rounded text-xs transition-colors flex items-center gap-2 shadow disabled:opacity-50"
            >
              {isSending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Send Test SMS via Vynfy</span>
            </button>
          </div>
        </form>

        {testResult && (
          <div className="p-4 bg-[#070D18] border border-emerald-500/40 rounded-lg text-xs text-emerald-300 space-y-1">
            <div className="font-bold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" />
              SMS Accepted by Vynfy Gateway!
            </div>
            <div>&bull; Recipient: <strong>{testResult.normalizedPhone}</strong></div>
            <div>&bull; Provider Message ID: <code className="text-white">{testResult.providerMessageId}</code></div>
            <div>&bull; Calculated GSM Segments: <strong>{testResult.segments}</strong></div>
            <div>&bull; Status: <strong className="uppercase">{testResult.status}</strong></div>
          </div>
        )}
      </div>

      {/* Recent Dispatches Ledger */}
      <div className="bg-[#0D1C38] border border-[#C6A65B]/30 rounded-xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-[#C6A65B]/20 flex items-center justify-between">
          <h3 className="font-editorial text-sm font-bold text-white uppercase tracking-wider">
            Recent SMS Dispatches Ledger
          </h3>
          <span className="text-[10px] text-[#DFCA95]/70 font-mono">
            {messages.length} SMS Logged
          </span>
        </div>

        <div className="table-responsive-container">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#070D18] text-[#C6A65B]">
              <tr>
                <th className="p-3">Recipient Phone</th>
                <th className="p-3">Snippet</th>
                <th className="p-3">Provider Message ID</th>
                <th className="p-3">Status</th>
                <th className="p-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C6A65B]/10 text-[#DFCA95]">
              {messages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-[#DFCA95]/60">
                    No SMS messages dispatched yet. Use the Test Dispatcher above to test a send.
                  </td>
                </tr>
              ) : (
                messages.map((m) => (
                  <tr key={m.id} className="hover:bg-[#102343]/50">
                    <td className="p-3 font-mono font-bold text-white">{m.recipientSnapshot}</td>
                    <td className="p-3 text-[#DFCA95]/80 max-w-xs truncate">{m.bodySnippet}</td>
                    <td className="p-3 font-mono text-[11px] text-white/70">{m.providerMessageId || "—"}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30 uppercase">
                        {m.status}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-[#DFCA95]/60">
                      {new Date(m.createdAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Key Modal */}
      {isEditingKey && (
        <EditKeyModal
          isOpen={true}
          onClose={() => setIsEditingKey(false)}
          providerKey="vynfy"
          displayName="Vynfy SMS Gateway"
          currentMaskedHint={integration?.credentials?.[0]?.maskedHint}
          metadata={meta}
          onKeyUpdated={handleKeyUpdated}
        />
      )}
    </div>
  );
}
