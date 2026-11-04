"use client";

import { useState } from "react";
import { Mail, CheckCircle2, Send, RefreshCw, ShieldCheck, Terminal, Key, AlertTriangle } from "lucide-react";
import { EditKeyModal } from "@/components/super-admin/EditKeyModal";

export function ResendEmailClientView({
  integration: initialIntegration,
  initialAttempts,
}: {
  integration: any;
  initialAttempts: any[];
}) {
  const [integration, setIntegration] = useState(initialIntegration);
  const [attempts, setAttempts] = useState<any[]>(initialAttempts);
  const [testEmail, setTestEmail] = useState("protocol-test@parliament.gh");
  const [isSending, setIsSending] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<string | null>(null);

  const meta = (() => {
    try {
      return JSON.parse(integration?.metadata || "{}");
    } catch (e) {
      return {};
    }
  })();

  const handleVerifyConnection = async () => {
    setIsVerifying(true);
    setVerifyStatus(null);
    try {
      const res = await fetch("/api/v1/super-admin/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerKey: "resend" }),
      });
      const data = await res.json();
      if (data.data?.result === "success") {
        setVerifyStatus(data.data.details || "Resend connection verified live.");
      } else {
        setVerifyStatus(`Verification failed: ${data.data?.error || data.error}`);
      }
    } catch (err: any) {
      setVerifyStatus(`Verification error: ${err.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleTestEmailSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setTestResult(null);
    setTestError(null);

    try {
      const res = await fetch("/api/v1/super-admin/email/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: testEmail }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to dispatch test email.");
      }

      setTestResult(data.data);
      setAttempts([
        {
          id: Date.now().toString(),
          recipientEmail: testEmail,
          provider: "resend",
          providerMessageId: data.data.providerMessageId,
          status: "delivered",
          createdAt: new Date().toISOString(),
        },
        ...attempts,
      ]);
    } catch (err: any) {
      setTestError(err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyUpdated = (providerKey: string, newHint: string, updatedMetadata?: string) => {
    const nextCreds = [{ maskedHint: newHint, status: "active" }];
    setIntegration({
      ...integration,
      credentials: nextCreds,
      metadata: updatedMetadata || integration.metadata,
    });
    handleVerifyConnection();
  };

  return (
    <div className="space-y-6">
      {/* Resend Configuration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#091833] border border-[#8FB2FF]/30 rounded-xl p-5 space-y-3 shadow-float">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/45 uppercase font-mono">Resend API Secret</span>
            <button
              onClick={() => setIsEditingKey(true)}
              className="bg-[#8FB2FF] hover:bg-[#8FB2FF] text-[#091833] font-bold text-[11px] px-2.5 py-1 rounded transition-colors flex items-center gap-1 "
            >
              <Key className="w-3 h-3" />
              <span>Edit Key</span>
            </button>
          </div>
          <div className="text-sm font-bold text-white font-mono">
            {integration?.credentials?.[0]?.maskedHint || "re_...9018"}
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Active in Environment
            </div>
            <button
              onClick={handleVerifyConnection}
              disabled={isVerifying}
              className="text-[11px] text-white/75 hover:text-white underline flex items-center gap-1"
            >
              {isVerifying ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Verify Now"}
            </button>
          </div>
        </div>

        <div className="bg-[#091833] border border-[#8FB2FF]/30 rounded-xl p-5 space-y-2 shadow-float">
          <div className="text-[10px] text-white/45 uppercase font-mono">Verified Sending Domain</div>
          <div className="text-base font-bold text-white font-mono">
            {meta.verifiedDomain || "marketing.dakyworld.com"}
          </div>
          <div className="text-[11px] text-white/60">
            Sender: <span className="text-white font-mono">{meta.senderEmail || "onboarding@resend.dev"}</span>
          </div>
        </div>

        <div className="bg-[#091833] border border-[#8FB2FF]/30 rounded-xl p-5 space-y-2 shadow-float">
          <div className="text-[10px] text-white/45 uppercase font-mono">Webhook Endpoint</div>
          <div className="text-xs font-mono text-white truncate">
            /api/v1/webhooks/email
          </div>
          <div className="text-[11px] text-white/60">
            DKIM / SPF: <span className="text-emerald-400 font-bold">Resend Live</span>
          </div>
        </div>
      </div>

      {verifyStatus && (
        <div className="p-3 bg-[#091833] border border-[#8FB2FF]/40 rounded-lg text-xs text-white/75 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#8FB2FF] shrink-0" />
          <span>{verifyStatus}</span>
        </div>
      )}

      {/* Test Email Dispatcher */}
      <div className="bg-[#091833] border border-[#8FB2FF]/30 rounded-xl p-6 shadow-float space-y-4">
        <div className="border-b border-[#8FB2FF]/20 pb-3 flex items-center justify-between">
          <div>
            <h3 className="font-editorial text-sm font-medium text-white uppercase tracking-wider">
              Resend Delivery Verification Test
            </h3>
            <p className="text-xs text-white/55">
              Dispatches a live state invitation test email using the official Parliamentary header & protocol seal.
            </p>
          </div>
          <span className="text-[10px] bg-[#091833] text-[#8FB2FF] px-2.5 py-1 rounded border border-[#8FB2FF]/30 font-mono">
            Provider: Resend Live
          </span>
        </div>

        <form onSubmit={handleTestEmailSend} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-white block mb-1">
              Destination Test Email Address
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                required
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1 bg-[#0D1526] border border-[#8FB2FF]/30 rounded p-2.5 text-white font-mono focus:outline-none focus:border-[#8FB2FF]"
              />
              <button
                type="submit"
                disabled={isSending}
                className="bg-[#8FB2FF] hover:bg-[#8FB2FF] text-[#091833] font-bold px-5 py-2.5 rounded text-xs transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isSending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Send Live Test Email</span>
              </button>
            </div>
            <p className="text-[10px] text-white/45 mt-1">
              Sends an institutional test invitation to the specified inbox using Resend credentials.
            </p>
          </div>
        </form>

        {testResult && (
          <div className="p-4 bg-[#0D1526] border border-emerald-500/40 rounded-lg text-xs text-emerald-300 space-y-1">
            <div className="font-bold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Email Successfully Accepted by Resend Gateway!
            </div>
            <div>&bull; Recipient: <strong>{testResult.recipient}</strong></div>
            <div>&bull; Provider Message ID: <code className="text-white">{testResult.providerMessageId}</code></div>
            <div>&bull; Gateway Latency: <span className="font-mono text-emerald-400">{testResult.latencyMs}ms</span></div>
          </div>
        )}

        {testError && (
          <div className="p-4 bg-rose-950/80 border border-rose-500/50 rounded-lg text-xs text-rose-300 space-y-1">
            <div className="font-bold text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Resend Delivery Notice
            </div>
            <div>{testError}</div>
          </div>
        )}
      </div>

      {/* Recent Email Attempts Ledger */}
      <div className="bg-[#091833] border border-[#8FB2FF]/30 rounded-xl overflow-hidden shadow-float">
        <div className="p-4 border-b border-[#8FB2FF]/20 flex items-center justify-between">
          <h3 className="font-editorial text-sm font-medium text-white uppercase tracking-wider">
            Recent Email Attempts Ledger
          </h3>
          <span className="text-[10px] text-white/55 font-mono">
            {attempts.length} Logged
          </span>
        </div>

        <div className="table-responsive-container">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0D1526] text-[#8FB2FF]">
              <tr>
                <th className="p-3">Recipient Email</th>
                <th className="p-3">Provider</th>
                <th className="p-3">Message ID</th>
                <th className="p-3">Status</th>
                <th className="p-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#8FB2FF]/10 text-white/75">
              {attempts.map((a) => (
                <tr key={a.id} className="hover:bg-[#091833]/50">
                  <td className="p-3 font-mono font-bold text-white">{a.recipientEmail}</td>
                  <td className="p-3 uppercase">{a.provider}</td>
                  <td className="p-3 font-mono text-[11px] text-white/70">{a.providerMessageId || "—"}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30 uppercase">
                      {a.status}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-[11px] text-white/45">
                    {new Date(a.createdAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditingKey && (
        <EditKeyModal
          isOpen={true}
          onClose={() => setIsEditingKey(false)}
          providerKey="resend"
          displayName="Resend API Key"
          currentMaskedHint={integration?.credentials?.[0]?.maskedHint}
          metadata={meta}
          onKeyUpdated={handleKeyUpdated}
        />
      )}
    </div>
  );
}
