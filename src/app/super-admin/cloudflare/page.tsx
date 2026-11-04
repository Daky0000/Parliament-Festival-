import { prisma } from "@/lib/db";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { CloudflareClientView } from "./CloudflareClientView";

export const dynamic = "force-dynamic";

export default async function SuperAdminCloudflarePage() {
  const cloudflare = await prisma.platformIntegration.findUnique({
    where: { providerKey: "cloudflare" },
    include: {
      credentials: { where: { status: "active" }, take: 1 },
      testLogs: { orderBy: { testedAt: "desc" }, take: 5 },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-editorial text-2xl font-bold text-white">
            Cloudflare Edge, Security & Object Storage
          </h2>
          <p className="text-xs text-[#DFCA95]/80 mt-1">
            Scoped API tokens &bull; Full (Strict) SSL &bull; Managed WAF Rules &bull; R2 Private Storage.
          </p>
        </div>
        <a
          href="https://developers.cloudflare.com/"
          target="_blank"
          rel="noreferrer"
          className="bg-[#102343] border border-[#C6A65B]/40 hover:bg-[#C6A65B] hover:text-[#0A1830] text-[#DFCA95] text-xs font-semibold px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 self-start"
        >
          <span>Cloudflare Docs</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Cloudflare Architecture Warning (Section 6.5 & 12) */}
      <div className="bg-[#102343] border-l-4 border-[#C6A65B] p-4 rounded-r-lg space-y-1">
        <div className="flex items-center gap-2 text-xs font-bold text-[#C6A65B] uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4 text-[#C6A65B]" />
          Infrastructure Architecture Notice: Scoped Tokens & Workload Placement
        </div>
        <p className="text-xs text-[#DFCA95]/90 leading-relaxed">
          Cloudflare is used for <strong>DNS, WAF, SSL, Turnstile bot protection, and R2 private asset storage</strong> with narrowly scoped API tokens. In accordance with Section 12, backend database transactions and long-running queue workers run on standard managed Node/Postgres runtimes rather than forcing edge worker constraints.
        </p>
      </div>

      <CloudflareClientView integration={cloudflare} />
    </div>
  );
}
