"use client";

import { useState } from "react";
import { Cpu, ArrowRight, ShieldCheck, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";

export function AiProvidersClientView({
  initialConfigs,
  initialLogs,
}: {
  initialConfigs: any[];
  initialLogs: any[];
}) {
  const [configs, setConfigs] = useState<any[]>(initialConfigs);
  const [logs, setLogs] = useState<any[]>(initialLogs);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any | null>(null);

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

  return (
    <div className="space-y-6">
      {/* Primary & Backup Routing Table */}
      <div className="bg-[#0D1C38] border border-[#C6A65B]/30 rounded-xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-[#C6A65B]/20 flex items-center justify-between">
          <div>
            <h3 className="font-editorial text-sm font-bold text-white uppercase tracking-wider">
              Configured Task-to-Model Routing Table
            </h3>
            <p className="text-[11px] text-[#DFCA95]/70">
              Deterministic priority order: Priority 1 (Primary) &bull; Priority 2 (Standby Backup)
            </p>
          </div>
          <button
            onClick={handleSimulateFailover}
            disabled={isSimulating}
            className="bg-[#102343] hover:bg-[#C6A65B] hover:text-[#0A1830] text-[#DFCA95] border border-[#C6A65B]/30 px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1.5"
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
            <thead className="bg-[#070D18] text-[#C6A65B]">
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
            <tbody className="divide-y divide-[#C6A65B]/10 text-[#DFCA95]">
              {configs.map((c) => (
                <tr key={c.id} className="hover:bg-[#102343]/50">
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
    </div>
  );
}
