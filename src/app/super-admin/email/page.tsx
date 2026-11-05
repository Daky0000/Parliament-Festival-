import { prisma } from "@/lib/db";
import { Mail, CheckCircle2, ShieldCheck, RefreshCw, Send, ExternalLink } from "lucide-react";
import { ResendEmailClientView } from "./ResendEmailClientView";

export const dynamic = "force-dynamic";

export default async function SuperAdminEmailPage() {
  const resendIntegration = await prisma.platformIntegration.findUnique({
    where: { providerKey: "resend" },
    include: {
      credentials: { where: { status: "active", credentialKey: "apiKey" }, take: 1, select: { maskedHint: true, credentialVersion: true, createdAt: true, createdBy: true, status: true } },
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
          <h2 className="font-editorial text-2xl font-medium text-white">
            Resend Transactional Email Infrastructure
          </h2>
          <p className="text-xs text-white/60 mt-1">
            Verified institutional domain sending &bull; Webhook signing secret validation &bull; Idempotent dispatch.
          </p>
        </div>
        <a
          href="https://resend.com/docs"
          target="_blank"
          rel="noreferrer"
          className="bg-[#091833] border border-[#8FB2FF]/40 hover:bg-[#8FB2FF] hover:text-[#091833] text-white/75 text-xs font-semibold px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 self-start"
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

