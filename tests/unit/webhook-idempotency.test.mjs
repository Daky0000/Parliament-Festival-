import test from "node:test";
import assert from "node:assert";
import { processIncomingWebhook } from "../../src/lib/email/provider.ts";
import { prisma } from "../../src/lib/db.ts";

test("Webhook Idempotency: duplicate provider events are safely ignored", async () => {
  const provider = "mock_test";
  const providerEventId = `evt_test_${Date.now()}`;

  // First ingestion
  const res1 = await processIncomingWebhook({
    provider,
    providerEventId,
    eventType: "delivered",
    rawPayload: { test: true },
  });

  assert.ok(res1.eventId, "First webhook must be persisted");
  assert.strictEqual(res1.status, "processed_unlinked");

  // Duplicate ingestion with same provider & providerEventId
  const res2 = await processIncomingWebhook({
    provider,
    providerEventId,
    eventType: "delivered",
    rawPayload: { test: true },
  });

  assert.strictEqual(
    res2.status,
    "ignored_duplicate",
    "Repeated webhook must be rejected as duplicate"
  );

  // Verify only 1 record exists in database
  const count = await prisma.providerWebhookEvent.count({
    where: { provider, providerEventId },
  });

  assert.strictEqual(count, 1, "Exactly one webhook record must exist in DB");
});

