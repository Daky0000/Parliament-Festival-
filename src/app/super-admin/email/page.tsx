import { prisma } from "@/lib/db";
import { Mail, CheckCircle2, ShieldCheck, RefreshCw, Send, ExternalLink } from "lucide-react";
import { ResendEmailClientView } from "./ResendEmailClientView";

export const dynamic = "force-dynamic";

export default async function SuperAdminEmailPage() {
  const resendIntegration = await prisma.platformIntegration.findUnique({
    where: { providerKey: "resend" },
    include: {
      credentials: { where: { status: "active" }, take: 1 },
      testLogs: { orderBy: { testedAt: "desc" }, take: 5 },
    },
  });

  const recentEmailAttempts = await prisma.emailAttempt.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { invitation: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-editorial text-2xl font-bold text-white">
            Resend Transactional Email Infrastructure
          </h2>
          <p className="text-xs text-[#DFCA95]/80 mt-1">
            Verified institutional domain sending &bull; Webhook signing secret validation &bull; Idempotent dispatch.
          </p>
        </div>
        <a
          href="https://resend.com/docs"
          target="_blank"
          rel="noreferrer"
          className="bg-[#102343] border border-[#C6A65B]/40 hover:bg-[#C6A65B] hover:text-[#0A1830] text-[#DFCA95] text-xs font-semibold px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 self-start"
        >
          <span>Resend Docs</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <ResendEmailClientView
        integration={resendIntegration}
        initialAttempts={recentEmailAttempts}
      />
    </div>
  );
}
