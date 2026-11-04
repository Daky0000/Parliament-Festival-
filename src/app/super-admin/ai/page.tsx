import { prisma } from "@/lib/db";
import { Cpu, ShieldCheck } from "lucide-react";
import { AiProvidersClientView } from "./AiProvidersClientView";

export const dynamic = "force-dynamic";

export default async function SuperAdminAiPage() {
  const configs = await prisma.aiProviderConfig.findMany({
    orderBy: [{ taskKey: "asc" }, { priority: "asc" }],
  });

  const usageLogs = await prisma.aiUsageLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const aiIntegrations = await prisma.platformIntegration.findMany({
    where: { providerKey: { in: ["openai", "anthropic"] } },
    include: { credentials: { where: { status: "active" }, take: 1 } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-editorial text-2xl font-medium text-white">
            AI Provider Routing & Governance (OpenAI / Claude)
          </h2>
          <p className="text-xs text-white/60 mt-1">
            Configure primary OpenAI workloads, Anthropic Claude failover priority, and token budgets.
          </p>
        </div>
      </div>

      {/* ChatGPT Policy Alert Box (Mandated by Section 1.1 & 5.1) */}
      <div className="bg-[#091833] border-l-4 border-[#8FB2FF] p-4 rounded-r-lg space-y-1">
        <div className="flex items-center gap-2 text-xs font-bold text-[#8FB2FF] uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4 text-[#8FB2FF]" />
          Institutional Architecture Policy: OpenAI API vs ChatGPT
        </div>
        <p className="text-xs text-white/70 leading-relaxed">
          Backend platform automation connects strictly to the <strong>OpenAI API</strong> (using project-scoped server credentials) with <strong>Anthropic Claude API</strong> as automated failover. <em>ChatGPT consumer subscriptions are an operator manual tool and must never be treated as server-side API credentials.</em>
        </p>
      </div>

      <AiProvidersClientView
        initialConfigs={configs}
        initialLogs={usageLogs}
        initialIntegrations={aiIntegrations}
      />
    </div>
  );
}
