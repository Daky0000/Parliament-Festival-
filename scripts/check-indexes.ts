// CI guard: Prisma cannot model partial unique indexes, so they live in a
// hand-written migration. Fail if any of them is missing (e.g. a later
// generated migration dropped it).
import { PrismaClient } from "@prisma/client";

const REQUIRED = [
  "uq_active_seat_assignment",
  "uq_active_guest_assignment",
  "uq_one_active_checkin_per_guest",
];

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()`;
  await prisma.$disconnect();
  const present = new Set(rows.map((r) => r.indexname));
  const missing = REQUIRED.filter((n) => !present.has(n));
  if (missing.length) {
    console.error(`Missing required indexes: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`All ${REQUIRED.length} partial unique indexes present.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
