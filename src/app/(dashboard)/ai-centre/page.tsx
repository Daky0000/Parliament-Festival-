import { prisma } from "@/lib/db";
import { AiCentreClientView } from "./AiCentreClientView";

export const dynamic = "force-dynamic";

export default async function AiCentrePage() {
  const event = await prisma.event.findFirst({
    where: { eventCode: "CAROLS-2026" },
  });

  if (!event) return <div>No event found.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-editorial text-2xl font-bold text-[#102343]">
          AI Protocol Command Centre
        </h2>
        <p className="text-xs text-[#667085] mt-1">
          Permission-scoped AI orchestration with strictly typed tools, human-in-the-loop approval gates, and institutional audit logging.
        </p>
      </div>

      <AiCentreClientView eventId={event.id} />
    </div>
  );
}

