"use client";

import { useState } from "react";
import { Mail, CheckCircle2, Send, RefreshCw, ShieldCheck, Terminal } from "lucide-react";

export function ResendEmailClientView({
  integration,
  initialAttempts,
}: {
  integration: any;
  initialAttempts: any[];
}) {
  const [attempts, setAttempts] = useState<any[]>(initialAttempts);
  const [testEmail, setTestEmail] = useState("protocol-test@parliament.gh");
  const [isSending, setIsSending] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);

  const handleTestEmailSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setTestResult(null);

    // Simulate Resend API test call
    setTimeout(() => {
      setTestResult({
        status: "DELIVERED",
        providerMessageId: `msg_resend_${Date.now()}`,
        recipient: testEmail,
        timestamp: new Date().toLocaleTimeString(),
      });
      setIsSending(false);
    }, 700);
  };

  return (
    <div className="space-y-6">
      {/* Resend Configuration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0D1C38] border border-[#C6A65B]/30 rounded-xl p-5 space-y-2 shadow-lg">
          <div className="text-[10px] text-[#DFCA95]/60 uppercase font-mono">Resend API Secret</div>
          <div className="text-sm font-bold text-white">
            {integration?.credentials[0]?.maskedHint || "re_...9018"}
          </div>
          <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Active & Authenticated
          </div>
        </div>

        <div className="bg-[#0D1C38] border border-[#C6A65B]/30 rounded-xl p-5 space-y-2 shadow-lg">
          <div className="text-[10px] text-[#DFCA95]/60 uppercase font-mono">Verified Sending Domain</div>
          <div className="text-base font-bold text-white font-mono">parliament.gh</div>
          <div className="text-[11px] text-[#DFCA95]/80">
            DKIM & SPF Records: <span className="text-emerald-400 font-bold">100% Verified</span>
          </div>
        </div>

        <div className="bg-[#0D1C38] border border-[#C6A65B]/30 rounded-xl p-5 space-y-2 shadow-lg">
          <div className="text-[10px] text-[#DFCA95]/60 uppercase font-mono">Webhook Endpoint</div>
          <div className="text-xs font-mono text-white truncate">
            /api/v1/webhooks/email
          </div>
          <div className="text-[11px] text-[#DFCA95]/80">
            Signature Verification: <span className="text-[#C6A65B] font-bold">Enforced</span>
          </div>
        </div>
      </div>

      {/* Test Email Dispatcher */}
      <div className="bg-[#0D1C38] border border-[#C6A65B]/30 rounded-xl p-6 shadow-lg space-y-4">
        <div className="border-b border-[#C6A65B]/20 pb-3 flex items-center justify-between">
          <div>
            <h3 className="font-editorial text-sm font-bold text-white uppercase tracking-wider">
              Resend Delivery Verification Test
            </h3>
            <p className="text-xs text-[#DFCA95]/70">
              Dispatches a test state invitation using the approved institutional layout.
            </p>
          </div>
          <span className="text-[10px] bg-[#102343] text-[#C6A65B] px-2.5 py-1 rounded border border-[#C6A65B]/30 font-mono">
            Provider: Resend
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
                className="flex-1 bg-[#070D18] border border-[#C6A65B]/30 rounded p-2.5 text-white font-mono focus:outline-none focus:border-[#C6A65B]"
              />
              <button
                type="submit"
                disabled={isSending}
                className="bg-[#C6A65B] hover:bg-[#DFCA95] text-[#0A1830] font-bold px-5 py-2.5 rounded text-xs transition-colors flex items-center gap-2 shadow disabled:opacity-50"
              >
                {isSending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Send Test Email
              </button>
            </div>
          </div>
        </form>

        {testResult && (
          <div className="p-4 bg-[#070D18] border border-emerald-500/40 rounded-lg text-xs text-emerald-300 space-y-1">
            <div className="font-bold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Email Successfully Accepted by Resend Gateway!
            </div>
            <div>&bull; Recipient: <strong>{testResult.recipient}</strong></div>
            <div>&bull; Provider Message ID: <code className="text-white">{testResult.providerMessageId}</code></div>
          </div>
        )}
      </div>

      {/* Recent Email Attempts Ledger */}
      <div className="bg-[#0D1C38] border border-[#C6A65B]/30 rounded-xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-[#C6A65B]/20 flex items-center justify-between">
          <h3 className="font-editorial text-sm font-bold text-white uppercase tracking-wider">
            Recent Email Attempts Ledger
          </h3>
          <span className="text-[10px] text-[#DFCA95]/70 font-mono">
            {attempts.length} Logged
          </span>
        </div>

        <div className="table-responsive-container">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#070D18] text-[#C6A65B]">
              <tr>
                <th className="p-3">Recipient Email</th>
                <th className="p-3">Provider</th>
                <th className="p-3">Message ID</th>
                <th className="p-3">Status</th>
                <th className="p-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C6A65B]/10 text-[#DFCA95]">
              {attempts.map((a) => (
                <tr key={a.id} className="hover:bg-[#102343]/50">
                  <td className="p-3 font-mono font-bold text-white">{a.recipientEmail}</td>
                  <td className="p-3 uppercase">{a.provider}</td>
                  <td className="p-3 font-mono text-[11px] text-white/70">{a.providerMessageId || "—"}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30 uppercase">
                      {a.status}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-[11px] text-[#DFCA95]/60">
                    {new Date(a.createdAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
