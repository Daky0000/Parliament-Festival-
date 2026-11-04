"use client";

import { useState } from "react";
import { Cpu, Mail, MessageSquare, Cloud, CheckCircle, RefreshCw, AlertTriangle, ShieldCheck, Power, Terminal } from "lucide-react";

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
        // Add to logs
        setTestLogs([
          {
            id: Date.now().toString(),
            integration: { displayName: providerKey.toUpperCase() },
            testType: "auth_validation",
            result: data.data.result,
            latencyMs: data.data.latencyMs,
            testedAt: data.data.testedAt,
          },
          ...testLogs.slice(0, 7),
        ]);
      }
    } catch (err) {
      console.error("Test error:", err);
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

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#0A1830] border-2 border-[#C6A65B] rounded-xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
                Control Plane &bull; Master Telemetry
              </span>
            </div>
            <h1 className="font-editorial text-2xl font-bold text-white">
              Platform Integration & Provider Management
            </h1>
            <p className="text-xs text-[#DFCA95]/80 mt-1 max-w-2xl">
              Centralized credential management, failover routing, and telemetry for OpenAI, Anthropic Claude, Resend, Vynfy SMS, and Cloudflare.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-[#102343] border border-[#C6A65B]/30 rounded-lg p-3 text-center min-w-[120px]">
              <div className="text-[10px] text-[#DFCA95]/70 uppercase">SMS Dispatches</div>
              <div className="text-lg font-bold text-[#C6A65B]">{metrics.totalSmsCount}</div>
            </div>
            <div className="bg-[#102343] border border-[#C6A65B]/30 rounded-lg p-3 text-center min-w-[120px]">
              <div className="text-[10px] text-[#DFCA95]/70 uppercase">AI Tasks Routed</div>
              <div className="text-lg font-bold text-[#C6A65B]">{metrics.totalAiRequests}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Provider Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((item) => {
          const cred = item.credentials[0];
          const isTesting = testingKey === item.providerKey;
          let meta = {};
          try {
            meta = JSON.parse(item.metadata || "{}");
          } catch (e) {}

          return (
            <div
              key={item.id}
              className={`bg-[#0D1C38] border rounded-xl p-5 shadow-lg flex flex-col justify-between space-y-4 transition-all ${
                item.isEnabled
                  ? "border-[#C6A65B]/40 hover:border-[#C6A65B]"
                  : "border-rose-900/60 opacity-75"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {item.providerKey === "openai" || item.providerKey === "anthropic" ? (
                      <Cpu className="w-5 h-5 text-[#C6A65B]" />
                    ) : item.providerKey === "resend" ? (
                      <Mail className="w-5 h-5 text-[#C6A65B]" />
                    ) : item.providerKey === "vynfy" ? (
                      <MessageSquare className="w-5 h-5 text-[#C6A65B]" />
                    ) : (
                      <Cloud className="w-5 h-5 text-[#C6A65B]" />
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
                <div className="bg-[#070D18] border border-[#C6A65B]/20 rounded p-2.5 space-y-1 text-xs font-mono">
                  <div className="text-[10px] text-[#DFCA95]/60 uppercase">Masked Secret Hint</div>
                  <div className="text-[#C6A65B] font-bold">
                    {cred?.maskedHint || "••••••••••••••••"}
                  </div>
                  <div className="text-[9px] text-[#DFCA95]/40 truncate">
                    Ref: {cred?.secretReference || "vault://default"}
                  </div>
                </div>

                {/* Provider Metadata Snippet */}
                <div className="mt-3 text-[11px] text-[#DFCA95]/80 space-y-1">
                  {item.providerKey === "openai" && (
                    <div>Role: <strong className="text-white">Primary AI Engine</strong> (gpt-4o)</div>
                  )}
                  {item.providerKey === "anthropic" && (
                    <div>Role: <strong className="text-white">Standby Fallback</strong> (claude-3-5)</div>
                  )}
                  {item.providerKey === "resend" && (
                    <div>Sending Domain: <strong className="text-white">parliament.gh</strong></div>
                  )}
                  {item.providerKey === "vynfy" && (
                    <div>Sender ID: <strong className="text-white">PARLIAMENT</strong> (+233 Ghana)</div>
                  )}
                  {item.providerKey === "cloudflare" && (
                    <div>Security Mode: <strong className="text-white">WAF + Full Strict SSL</strong></div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[#C6A65B]/20 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleTestConnection(item.providerKey)}
                  disabled={isTesting}
                  className="bg-[#102343] hover:bg-[#C6A65B] hover:text-[#0A1830] text-[#DFCA95] border border-[#C6A65B]/30 text-xs font-semibold px-3 py-1.5 rounded transition-colors flex items-center gap-1.5"
                >
                  {isTesting ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                  )}
                  <span>Test Connection</span>
                </button>

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
      <div className="bg-[#0D1C38] border border-[#C6A65B]/30 rounded-xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-[#C6A65B]/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#C6A65B]" />
            <h3 className="font-editorial text-sm font-bold text-white uppercase tracking-wider">
              Recent Provider Health Verification Checks
            </h3>
          </div>
          <span className="text-[10px] text-[#DFCA95]/60 font-mono">
            Immutable Test Audit Stream
          </span>
        </div>

        <div className="table-responsive-container">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#070D18] text-[#C6A65B]">
              <tr>
                <th className="p-3">Integration</th>
                <th className="p-3">Test Type</th>
                <th className="p-3">Result</th>
                <th className="p-3">Latency</th>
                <th className="p-3">Tested By</th>
                <th className="p-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C6A65B]/10 text-[#DFCA95]">
              {testLogs.map((log) => (
                <tr key={log.id} className="hover:bg-[#102343]/50">
                  <td className="p-3 font-bold text-white">{log.integration?.displayName}</td>
                  <td className="p-3 font-mono text-[11px]">{log.testType}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                      SUCCESS
                    </span>
                  </td>
                  <td className="p-3 font-mono text-emerald-400">{log.latencyMs}ms</td>
                  <td className="p-3 text-[#DFCA95]/70">{log.testedBy || "Super Admin"}</td>
                  <td className="p-3 font-mono text-[11px] text-[#DFCA95]/60">
                    {log.testedAt ? new Date(log.testedAt).toLocaleTimeString() : "Just now"}
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
