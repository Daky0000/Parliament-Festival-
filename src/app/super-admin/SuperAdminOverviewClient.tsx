"use client";

import { useState } from "react";
import { Cpu, Mail, MessageSquare, Cloud, CheckCircle, RefreshCw, AlertTriangle, ShieldCheck, Power, Terminal, Key } from "lucide-react";
import { EditKeyModal } from "@/components/super-admin/EditKeyModal";

export function SuperAdminOverviewClient({
  initialIntegrations,
  initialLogs,
  metrics,
}: {
  initialIntegrations: any[];
  initialLogs: any[];
  metrics: { totalSmsCount: number; totalAiRequests: number };
}) {
  const [integrations, setIntegrations] = useState<any[]>(initialIntegrations);
  const [testLogs, setTestLogs] = useState<any[]>(initialLogs);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [lastTestFeedback, setLastTestFeedback] = useState<{ [key: string]: { status: string; text: string } }>({});

  const handleTestConnection = async (providerKey: string) => {
    setTestingKey(providerKey);
    try {
      const res = await fetch("/api/v1/super-admin/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerKey }),
      });
      const data = await res.json();
      if (data.data) {
        setLastTestFeedback((prev) => ({
          ...prev,
          [providerKey]: {
            status: data.data.result,
            text: data.data.details || data.data.error || "Verification completed.",
          },
        }));

        setTestLogs((prev) => [
          {
            id: Date.now().toString(),
            integration: { displayName: providerKey.toUpperCase() },
            testType: "auth_validation",
            result: data.data.result,
            latencyMs: data.data.latencyMs,
            testedAt: data.data.testedAt,
            testedBy: "Super Admin",
            sanitisedError: data.data.details || data.data.error,
          },
          ...prev.slice(0, 9),
        ]);
      }
    } catch (err: any) {
      console.error("Test error:", err);
      setLastTestFeedback((prev) => ({
        ...prev,
        [providerKey]: {
          status: "failed",
          text: err.message || "Network error occurred.",
        },
      }));
    } finally {
      setTestingKey(null);
    }
  };

  const handleToggleKillSwitch = async (providerKey: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`/api/v1/super-admin/integrations/${providerKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !currentEnabled }),
      });
      const data = await res.json();
      if (data.data) {
        setIntegrations(
          integrations.map((i) =>
            i.providerKey === providerKey ? { ...i, isEnabled: !currentEnabled } : i
          )
        );
      }
    } catch (err) {
      console.error("Toggle error:", err);
    }
  };

  const handleKeyUpdated = (providerKey: string, newHint: string, newMetadata?: string) => {
    setIntegrations((prev) =>
      prev.map((item) => {
        if (item.providerKey === providerKey) {
          const updatedCreds = item.credentials?.length
            ? [{ ...item.credentials[0], maskedHint: newHint }, ...item.credentials.slice(1)]
            : [{ id: "new", maskedHint: newHint, status: "active" }];
          return {
            ...item,
            credentials: updatedCreds,
            metadata: newMetadata || item.metadata,
          };
        }
        return item;
      })
    );
    // Auto-trigger test connection to verify immediately
    handleTestConnection(providerKey);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#091833] border-2 border-[#8FB2FF] rounded-xl p-6 shadow-float relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
                Control Plane &bull; Master Telemetry & API Key Vault
              </span>
            </div>
            <h1 className="font-editorial text-2xl font-medium text-white">
              Platform Integration & Provider Management
            </h1>
            <p className="text-xs text-white/60 mt-1 max-w-2xl">
              Centralized credential management, live failover routing, and telemetry for OpenAI, Anthropic Claude, Resend, Vynfy SMS, and Cloudflare.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-[#091833] border border-[#8FB2FF]/30 rounded-lg p-3 text-center min-w-[120px]">
              <div className="text-[10px] text-white/55 uppercase">SMS Dispatches</div>
              <div className="text-lg font-bold text-[#8FB2FF]">{metrics.totalSmsCount}</div>
            </div>
            <div className="bg-[#091833] border border-[#8FB2FF]/30 rounded-lg p-3 text-center min-w-[120px]">
              <div className="text-[10px] text-white/55 uppercase">AI Tasks Routed</div>
              <div className="text-lg font-bold text-[#8FB2FF]">{metrics.totalAiRequests}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Provider Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((item) => {
          const cred = item.credentials?.[0];
          const isTesting = testingKey === item.providerKey;
          const feedback = lastTestFeedback[item.providerKey];
          let meta: any = {};
          try {
            meta = JSON.parse(item.metadata || "{}");
          } catch (e) {}

          const isKeyPending = !cred?.maskedHint || cred.maskedHint.includes("Pending");

          return (
            <div
              key={item.id}
              className={`bg-[#091833] border rounded-xl p-5 shadow-float flex flex-col justify-between space-y-4 transition-all ${
                item.isEnabled
                  ? "border-[#8FB2FF]/40 hover:border-[#8FB2FF]"
                  : "border-rose-900/60 opacity-75"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {item.providerKey === "openai" || item.providerKey === "anthropic" ? (
                      <Cpu className="w-5 h-5 text-[#8FB2FF]" />
                    ) : item.providerKey === "resend" ? (
                      <Mail className="w-5 h-5 text-[#8FB2FF]" />
                    ) : item.providerKey === "vynfy" ? (
                      <MessageSquare className="w-5 h-5 text-[#8FB2FF]" />
                    ) : (
                      <Cloud className="w-5 h-5 text-[#8FB2FF]" />
                    )}
                    <h3 className="font-bold text-sm text-white">{item.displayName}</h3>
                  </div>

                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      item.isEnabled
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                        : "bg-rose-950 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    {item.isEnabled ? "Active" : "Disabled"}
                  </span>
                </div>

                {/* Secret Reference Box (Masked) */}
                <div className="bg-[#0D1526] border border-[#8FB2FF]/20 rounded p-2.5 space-y-1 text-xs font-mono">
                  <div className="flex items-center justify-between text-[10px] text-white/45 uppercase">
                    <span>Masked Secret Hint</span>
                    {isKeyPending ? (
                      <span className="text-[#8FB2FF] font-bold">Key Needed</span>
                    ) : (
                      <span className="text-emerald-400 font-bold">Configured</span>
                    )}
                  </div>
                  <div className="text-[#8FB2FF] font-bold font-mono">
                    {cred?.maskedHint || "••••••••••••••••"}
                  </div>
                  <div className="text-[9px] text-white/40 truncate">
                    Ref: {cred?.secretReference || "vault://default"}
                  </div>
                </div>

                {/* Provider Metadata Snippet */}
                <div className="mt-3 text-[11px] text-white/60 space-y-1">
                  {item.providerKey === "openai" && (
                    <div>Role: <strong className="text-white">Primary AI Engine</strong> (gpt-4o)</div>
                  )}
                  {item.providerKey === "anthropic" && (
                    <div>Role: <strong className="text-white">Standby Fallback</strong> (claude-3-5)</div>
                  )}
                  {item.providerKey === "resend" && (
                    <div>Sending Domain: <strong className="text-white">{meta.verifiedDomain || "marketing.dakyworld.com"}</strong></div>
                  )}
                  {item.providerKey === "vynfy" && (
                    <div>Sender ID: <strong className="text-white">{meta.senderId || "PARLIAMENT"}</strong> (+233 Ghana)</div>
                  )}
                  {item.providerKey === "cloudflare" && (
                    <div>R2 Bucket: <strong className="text-white">{meta.r2Bucket || "dakyxtech-private"}</strong></div>
                  )}
                </div>

                {/* Live Test Feedback Banner */}
                {feedback && (
                  <div
                    className={`mt-2.5 p-2 rounded text-[11px] border leading-snug ${
                      feedback.status === "success"
                        ? "bg-emerald-950/70 border-emerald-500/40 text-emerald-300"
                        : "bg-rose-950/70 border-rose-500/40 text-rose-300"
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1 uppercase text-[10px]">
                      {feedback.status === "success" ? (
                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 text-rose-400" />
                      )}
                      <span>{feedback.status === "success" ? "Verified Online" : "Verification Notice"}</span>
                    </div>
                    <div className="mt-0.5">{feedback.text}</div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[#8FB2FF]/20 flex items-center justify-between gap-1.5 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleTestConnection(item.providerKey)}
                    disabled={isTesting}
                    className="bg-[#091833] hover:bg-[#8FB2FF] hover:text-[#091833] text-white/75 border border-[#8FB2FF]/30 text-xs font-semibold px-2.5 py-1.5 rounded transition-colors flex items-center gap-1"
                  >
                    {isTesting ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3 h-3 text-emerald-400" />
                    )}
                    <span>Test</span>
                  </button>

                  <button
                    onClick={() => setEditingItem(item)}
                    className="bg-[#8FB2FF] hover:bg-[#8FB2FF] text-[#091833] text-xs font-bold px-2.5 py-1.5 rounded transition-colors flex items-center gap-1 "
                  >
                    <Key className="w-3 h-3" />
                    <span>{isKeyPending ? "Add Key" : "Edit Key"}</span>
                  </button>
                </div>

                <button
                  onClick={() => handleToggleKillSwitch(item.providerKey, item.isEnabled)}
                  className={`text-xs px-2.5 py-1.5 rounded font-bold transition-colors flex items-center gap-1 ${
                    item.isEnabled
                      ? "bg-rose-950/80 text-rose-300 hover:bg-rose-900 border border-rose-500/30"
                      : "bg-emerald-950/80 text-emerald-300 hover:bg-emerald-900 border border-emerald-500/30"
                  }`}
                >
                  <Power className="w-3 h-3" />
                  <span>{item.isEnabled ? "Disable" : "Enable"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Integration Test Logs Table */}
      <div className="bg-[#091833] border border-[#8FB2FF]/30 rounded-xl overflow-hidden shadow-float">
        <div className="p-4 border-b border-[#8FB2FF]/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#8FB2FF]" />
            <h3 className="font-editorial text-sm font-medium text-white uppercase tracking-wider">
              Recent Provider Health Verification Checks
            </h3>
          </div>
          <span className="text-[10px] text-white/45 font-mono">
            Live Verification Stream
          </span>
        </div>

        <div className="table-responsive-container">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0D1526] text-[#8FB2FF]">
              <tr>
                <th className="p-3">Integration</th>
                <th className="p-3">Test Type</th>
                <th className="p-3">Result</th>
                <th className="p-3">Latency</th>
                <th className="p-3">Details / Response</th>
                <th className="p-3">Tested By</th>
                <th className="p-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#8FB2FF]/10 text-white/75">
              {testLogs.map((log) => (
                <tr key={log.id} className="hover:bg-[#091833]/50">
                  <td className="p-3 font-bold text-white">{log.integration?.displayName}</td>
                  <td className="p-3 font-mono text-[11px]">{log.testType}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        log.result === "success"
                          ? "bg-emerald-950 text-emerald-400 border-emerald-500/30"
                          : "bg-rose-950 text-rose-400 border-rose-500/30"
                      }`}
                    >
                      {log.result === "success" ? "SUCCESS" : "FAILED"}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-emerald-400">{log.latencyMs}ms</td>
                  <td className="p-3 text-[11px] text-white/60 max-w-xs truncate">
                    {log.sanitisedError || "Verified operational."}
                  </td>
                  <td className="p-3 text-white/55">{log.testedBy || "Super Admin"}</td>
                  <td className="p-3 font-mono text-[11px] text-white/45" suppressHydrationWarning>
                    {log.testedAt ? new Date(log.testedAt).toLocaleTimeString() : "Just now"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Key Modal */}
      {editingItem && (
        <EditKeyModal
          isOpen={true}
          onClose={() => setEditingItem(null)}
          providerKey={editingItem.providerKey}
          displayName={editingItem.displayName}
          currentMaskedHint={editingItem.credentials?.[0]?.maskedHint}
          metadata={(() => {
            try {
              return JSON.parse(editingItem.metadata || "{}");
            } catch (e) {
              return {};
            }
          })()}
          onKeyUpdated={handleKeyUpdated}
        />
      )}
    </div>
  );
}
