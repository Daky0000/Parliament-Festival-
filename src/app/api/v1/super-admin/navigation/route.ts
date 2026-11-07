import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withActor, requireGlobal } from "@/lib/authz";
import { badRequest, readJson } from "@/lib/http";
import { logAuditEvent } from "@/lib/audit";
import { navigationItems } from "@/components/layout/nav-items";
import { getHiddenNavHrefs } from "@/lib/viewer";

const Body = z.object({ hiddenHrefs: z.array(z.string().max(200)).max(100) });

export const GET = withActor(async (_req, { actor }) => {
  requireGlobal(actor, "platform.manage");
  return NextResponse.json({ data: { hiddenHrefs: await getHiddenNavHrefs(actor.organizationId) } });
});

/** Replaces the set of dashboard menu items hidden from users who are not super admins. */
export const PUT = withActor(async (request, { actor }) => {
  requireGlobal(actor, "platform.manage");
  const { hiddenHrefs } = Body.parse(await readJson(request));
  const known = new Set(navigationItems.map((i) => i.href));
  const unknown = hiddenHrefs.filter((h) => !known.has(h));
  if (unknown.length) throw badRequest(`Unknown menu item: ${unknown.join(", ")}`);
  const next = [...new Set(hiddenHrefs)];

  const before = await getHiddenNavHrefs(actor.organizationId);
  await prisma.organization.update({
    where: { id: actor.organizationId },
    data: { hiddenNavHrefs: next },
  });
  await logAuditEvent({
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    action: "platform.navigation_visibility_changed",
    entityType: "organization",
    entityId: actor.organizationId,
    beforeData: { hiddenHrefs: before },
    afterData: { hiddenHrefs: next },
  });
  return NextResponse.json({ data: { hiddenHrefs: next } });
});
