import { prisma } from "@/lib/db";
import { MessageSquare, ShieldCheck, Power, Send, AlertTriangle, ExternalLink } from "lucide-react";
import { VynfySmsClientView } from "./VynfySmsClientView";

export const dynamic = "force-dynamic";

export default async function SuperAdminSmsPage() {
  const vynfyIntegration = await prisma.platformIntegration.findUnique({
    where: { providerKey: "vynfy" },
    include: {
      credentials: { where: { status: "active", credentialKey: "apiKey" }, take: 1, select: { maskedHint: true, credentialVersion: true, createdAt: true, createdBy: true, status: true } },
      testLogs: { orderBy: { testedAt: "desc" }, take: 5 },
    },
  });

  const recentMessages = await prisma.communicationMessage.findMany({
    where: { channel: "sms" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const totalSmsCount = await prisma.communicationMessage.count({
    where: { channel: "sms" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-editorial text-2xl font-medium text-white">
            Vynfy SMS Gateway Infrastructure
          </h2>
          <p className="text-xs text-white/60 mt-1">
            Official designated SMS telecommunications gateway &bull; Ghana E.164 (+233) compliance.
          </p>
        </div>
        <a
          href="https://www.vynfy.com/"
          target="_blank"
          rel="noreferrer"
          className="bg-[#091833] border border-[#8FB2FF]/40 hover:bg-[#8FB2FF] hover:text-[#091833] text-white/75 text-xs font-semibold px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 self-start"
        >
          <span>Vynfy Portal</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <VynfySmsClientView
        integration={vynfyIntegration}
        initialMessages={recentMessages}
        totalCount={totalSmsCount}
      />
    </div>
  );
}

