import { prisma } from "@/lib/db";
import { AiCentreClientView } from "./AiCentreClientView";

export const dynamic = "force-dynamic";

export default async function AiCentrePage() {
  const event = await prisma.event.findFirst({
    where: { eventCode: "CAROLS-2026" },
  });

  if (!event) return <div>No event found.</div>;

  return (
    <div className="space-y-[var(--frame)]">
      <div className="panel px-6 py-6 sm:px-8 sm:py-7">
        <h2 className="font-editorial text-[28px] sm:text-[34px] leading-[1.1] font-normal tracking-[-0.035em] text-[#0D1526]">
          AI Protocol Command Centre
        </h2>
        <p className="text-[15px] leading-relaxed text-[#5B6374] mt-2 max-w-[70ch]">
          Permission-scoped AI orchestration with strictly typed tools, human-in-the-loop approval gates, and institutional audit logging.
        </p>
      </div>

      <AiCentreClientView eventId={event.id} />
    </div>
  );
}

