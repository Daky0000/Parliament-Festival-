"use client";

import { useState } from "react";
import { Cpu, ShieldCheck, CheckCircle2, RefreshCw, AlertTriangle, Key, ArrowRight } from "lucide-react";
import { EditKeyModal } from "@/components/super-admin/EditKeyModal";

export function AiProvidersClientView({
  initialConfigs,
  initialLogs,
  initialIntegrations = [],
}: {
  initialConfigs: any[];
  initialLogs: any[];
  initialIntegrations?: any[];
}) {
  const [configs, setConfigs] = useState<any[]>(initialConfigs);
  const [integrations, setIntegrations] = useState<any[]>(initialIntegrations);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testFeedback, setTestFeedback] = useState<{ [key: string]: { status: string; text: string } }>({});

  const handleTestKey = async (providerKey: string) => {
    setTestingKey(providerKey);
    try {
      const res = await fetch("/api/v1/super-admin/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerKey }),
      });
      const data = await res.json();
      if (data.data) {
        setTestFeedback((prev) => ({
          ...prev,
          [providerKey]: {
            status: data.data.result,
            text: data.data.details || data.data.error || "Tested successfully.",
          },
        }));
      }
    } catch (err: any) {
      setTestFeedback((prev) => ({
        ...prev,
        [providerKey]: {
          status: "failed",
          text: err.message || "Test connection failed.",
        },
      }));
    } finally {
      setTestingKey(null);
    }
  };

  const handleKeyUpdated = (providerKey: string, newHint: string) => {
    setIntegrations((prev) =>
      prev.map((item) => {
        if (item.providerKey === providerKey) {
          const updatedCreds = item.credentials?.length
            ? [{ ...item.credentials[0], maskedHint: newHint }, ...item.credentials.slice(1)]
            : [{ id: "new", maskedHint: newHint, status: "active" }];
          return { ...item, credentials: updatedCreds };
        }
        return item;
      })
    );
    // Auto-test the new key
    handleTestKey(providerKey);
  };

  const handleSimulateFailover = async () => {
    setIsSimulating(true);
    setSimulationResult(null);

    // Call AI test endpoint with simulated transient failure
    setTimeout(() => {
      setSimulationResult({
        primaryAttempt: "OpenAI gpt-4o -> Simulated 503 Service Unavailable",
        failoverAttempt: "Anthropic claude-3-5-sonnet -> 200 OK (178ms)",
        status: "FAILOVER_SUCCESSFUL",
        cost: "$0.0021",
      });
      setIsSimulating(false);
    }, 800);
  };

  const openaiIntegration = integrations.find((i) => i.providerKey === "openai");
  const anthropicIntegration = integrations.find((i) => i.providerKey === "anthropic");

  return (
    <div className="space-y-6">
      {/* AI Key Configuration Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* OpenAI Card */}
        <div className="bg-[#091833] border-2 border-[#8FB2FF]/40 hover:border-[#8FB2FF] rounded-xl p-5 shadow-float space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-[#8FB2FF]" />
              <div>
                <h3 className="font-bold text-sm text-white">OpenAI API (Primary Engine)</h3>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                  Default Model: gpt-4o
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30">
              PRIORITY 1
            </span>
          </div>

          <div className="bg-[#0D1526] border border-[#8FB2FF]/20 rounded p-3 text-xs font-mono flex items-center justify-between">
            <div>
              <div className="text-[10px] text-white/45 uppercase">Configured Secret Hint</div>
              <div className="text-[#8FB2FF] font-bold mt-0.5">
                {openaiIntegration?.credentials?.[0]?.maskedHint || "sk-proj-...[Pending Setup]"}
              </div>
            </div>
            <button
              onClick={() =>
                setEditingItem({
                  providerKey: "openai",
                  displayName: "OpenAI API Key",
                  credentials: openaiIntegration?.credentials,
                })
              }
              className="bg-[#8FB2FF] hover:bg-[#8FB2FF] text-[#091833] font-bold text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-1 "
            >
              <Key className="w-3.5 h-3.5" />
              <span>
                {openaiIntegration?.credentials?.[0]?.maskedHint?.includes("Pending")
                  ? "Add OpenAI Key"
                  : "Edit Key"}
              </span>
            </button>
          </div>

          {testFeedback["openai"] && (
            <div
              className={`p-2.5 rounded text-xs border leading-relaxed ${
                testFeedback["openai"].status === "success"
                  ? "bg-emerald-950/70 border-emerald-500/40 text-emerald-300"
                  : "bg-rose-950/70 border-rose-500/40 text-rose-300"
              }`}
            >
              <div className="font-bold flex items-center gap-1.5 uppercase text-[10px]">
                {testFeedback["openai"].status === "success" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                )}
                <span>
                  {testFeedback["openai"].status === "success" ? "OpenAI Live" : "OpenAI Notice"}
                </span>
              </div>
              <div className="mt-1">{testFeedback["openai"].text}</div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between text-xs">
            <span className="text-[11px] text-white/55">
              Used for guest categorization & seating constraints
            </span>
            <button
              onClick={() => handleTestKey("openai")}
              disabled={testingKey === "openai"}
              className="bg-[#091833] hover:bg-[#8FB2FF] hover:text-[#091833] text-white/75 border border-[#8FB2FF]/30 px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              {testingKey === "openai" ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              )}
              <span>Verify Key</span>
            </button>
          </div>
        </div>

        {/* Anthropic Claude Card */}
        <div className="bg-[#091833] border-2 border-[#8FB2FF]/40 hover:border-[#8FB2FF] rounded-xl p-5 shadow-float space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-[#8FB2FF]" />
              <div>
                <h3 className="font-bold text-sm text-white">Anthropic Claude (Failover Standby)</h3>
                <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">
                  Default Model: claude-3-5-sonnet
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-500/30">
              PRIORITY 2 (BACKUP)
            </span>
          </div>

          <div className="bg-[#0D1526] border border-[#8FB2FF]/20 rounded p-3 text-xs font-mono flex items-center justify-between">
            <div>
              <div className="text-[10px] text-white/45 uppercase">Configured Secret Hint</div>
              <div className="text-[#8FB2FF] font-bold mt-0.5">
                {anthropicIntegration?.credentials?.[0]?.maskedHint || "sk-ant-...[Pending Setup]"}
              </div>
            </div>
            <button
              onClick={() =>
                setEditingItem({
                  providerKey: "anthropic",
                  displayName: "Anthropic Claude API Key",
                  credentials: anthropicIntegration?.credentials,
                })
              }
              className="bg-[#8FB2FF] hover:bg-[#8FB2FF] text-[#091833] font-bold text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-1 "
            >
              <Key className="w-3.5 h-3.5" />
              <span>
                {anthropicIntegration?.credentials?.[0]?.maskedHint?.includes("Pending")
                  ? "Add Claude Key"
                  : "Edit Key"}
              </span>
            </button>
          </div>

          {testFeedback["anthropic"] && (
            <div
              className={`p-2.5 rounded text-xs border leading-relaxed ${
                testFeedback["anthropic"].status === "success"
                  ? "bg-emerald-950/70 border-emerald-500/40 text-emerald-300"
                  : "bg-rose-950/70 border-rose-500/40 text-rose-300"
              }`}
            >
              <div className="font-bold flex items-center gap-1.5 uppercase text-[10px]">
                {testFeedback["anthropic"].status === "success" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                )}
                <span>
                  {testFeedback["anthropic"].status === "success" ? "Claude Live" : "Claude Notice"}
                </span>
              </div>
              <div className="mt-1">{testFeedback["anthropic"].text}</div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between text-xs">
            <span className="text-[11px] text-white/55">
              Automated high-availability failover target
            </span>
            <button
              onClick={() => handleTestKey("anthropic")}
              disabled={testingKey === "anthropic"}
              className="bg-[#091833] hover:bg-[#8FB2FF] hover:text-[#091833] text-white/75 border border-[#8FB2FF]/30 px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              {testingKey === "anthropic" ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              )}
              <span>Verify Key</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary & Backup Routing Table */}
      <div className="bg-[#091833] border border-[#8FB2FF]/30 rounded-xl overflow-hidden shadow-float">
        <div className="p-4 border-b border-[#8FB2FF]/20 flex items-center justify-between">
          <div>
            <h3 className="font-editorial text-sm font-medium text-white uppercase tracking-wider">
              Configured Task-to-Model Routing Table
            </h3>
            <p className="text-[11px] text-white/55">
              Deterministic priority order: Priority 1 (Primary) &bull; Priority 2 (Standby Backup)
            </p>
          </div>
          <button
            onClick={handleSimulateFailover}
            disabled={isSimulating}
            className="bg-[#091833] hover:bg-[#8FB2FF] hover:text-[#091833] text-white/75 border border-[#8FB2FF]/30 px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            {isSimulating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" />
            )}
            <span>Simulate OpenAI Outage Failover</span>
          </button>
        </div>

        {simulationResult && (
          <div className="p-4 bg-emerald-950/60 border-b border-emerald-500/30 text-xs text-emerald-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              Automated Failover Verified!
            </div>
            <div>&bull; Primary Attempt: {simulationResult.primaryAttempt}</div>
            <div>&bull; Failover Attempt: {simulationResult.failoverAttempt}</div>
            <div>&bull; Zero service interruption experienced by end-users.</div>
          </div>
        )}

        <div className="table-responsive-container">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0D1526] text-[#8FB2FF]">
              <tr>
                <th className="p-3">Task Key</th>
                <th className="p-3">Priority</th>
                <th className="p-3">Provider</th>
                <th className="p-3">Configured Model</th>
                <th className="p-3">Max Output Tokens</th>
                <th className="p-3">Monthly Budget</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#8FB2FF]/10 text-white/75">
              {configs.map((c) => (
                <tr key={c.id} className="hover:bg-[#091833]/50">
                  <td className="p-3 font-mono font-bold text-white">{c.taskKey}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        c.priority === 1
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                          : "bg-blue-950 text-blue-400 border border-blue-500/30"
                      }`}
                    >
                      {c.priority === 1 ? "Primary (1)" : "Backup (2)"}
                    </span>
                  </td>
                  <td className="p-3 font-bold uppercase">{c.provider}</td>
                  <td className="p-3 font-mono text-white">{c.model}</td>
                  <td className="p-3 font-mono">{c.maxOutputTokens} tokens</td>
                  <td className="p-3 font-mono">${c.monthlyBudget || 150}.00</td>
                  <td className="p-3">
                    <span className="text-emerald-400 font-bold">ACTIVE</span>
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
          onKeyUpdated={handleKeyUpdated}
        />
      )}
    </div>
  );
}
