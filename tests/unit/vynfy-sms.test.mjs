import test from "node:test";
import assert from "node:assert";
import { normalizeGhanaPhone, calculateSmsSegments, sendVynfySms } from "../../src/lib/sms/vynfy.ts";
import { prisma } from "../../src/lib/db.ts";

async function setVynfy(data) {
  await prisma.platformIntegration.upsert({
    where: { providerKey: "vynfy" },
    update: data,
    create: { providerKey: "vynfy", displayName: "Vynfy", integrationType: "sms", ...data },
  });
}

test("Vynfy: Ghana numbers normalise to E.164 and invalid ones are rejected", () => {
  assert.strictEqual(normalizeGhanaPhone("0241234567"), "+233241234567");
  assert.strictEqual(normalizeGhanaPhone("241234567"), "+233241234567");
  assert.strictEqual(normalizeGhanaPhone("+233241234567"), "+233241234567");
  assert.strictEqual(normalizeGhanaPhone("233241234567"), "+233241234567");
  assert.strictEqual(normalizeGhanaPhone("050 987 6543"), "+233509876543");
  for (const bad of ["12345", "+44 7700 900123", "02412345678", "0941234567", "abc"]) {
    assert.strictEqual(normalizeGhanaPhone(bad), null, bad);
  }
});

test("Vynfy: GSM 03.38 segments, including extension characters and Unicode", () => {
  assert.strictEqual(calculateSmsSegments("Short invitation message"), 1);
  assert.strictEqual(calculateSmsSegments("A".repeat(160)), 1);
  assert.strictEqual(calculateSmsSegments("A".repeat(170)), 2);
  assert.strictEqual(calculateSmsSegments("A".repeat(320)), 3);
  assert.strictEqual(calculateSmsSegments("€".repeat(80)), 1, "80 extension chars = 160 septets");
  assert.strictEqual(calculateSmsSegments("€".repeat(81)), 2);
  assert.strictEqual(calculateSmsSegments("Akwaaba ✓"), 1, "non-GSM switches to UCS-2");
  assert.strictEqual(calculateSmsSegments("✓".repeat(71)), 2);
});

test("Vynfy: kill switch fails closed and records the refusal", async () => {
  const event = await prisma.event.findFirstOrThrow({ where: { eventCode: "CAROLS-2026" } });
  await prisma.platformIntegration.deleteMany({ where: { providerKey: "vynfy" } });
  const missing = await sendVynfySms({ eventId: event.id, recipientPhone: "0244112233", messageText: "x" });
  assert.strictEqual(missing.status, "killed", "no integration row => blocked");

  await setVynfy({ isEnabled: true, metadata: JSON.stringify({ emergencyKillSwitchActive: true }) });
  const killed = await sendVynfySms({ eventId: event.id, recipientPhone: "0244112233", messageText: "x" });
  assert.strictEqual(killed.status, "killed");
  const row = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: killed.messageId } });
  assert.strictEqual(row.failureCode, "KILL_SWITCH_ACTIVE");
});

test("Vynfy (mock in tests): records a submission, is idempotent, and never fabricates a provider id", async () => {
  const event = await prisma.event.findFirstOrThrow({ where: { eventCode: "CAROLS-2026" } });
  await setVynfy({ isEnabled: true, metadata: "{}" });
  const key = `test-sms-${Date.now()}`;
  const result = await sendVynfySms({ eventId: event.id, recipientPhone: "0244112233", messageText: "Test", senderId: "PARLIAMENT", idempotencyKey: key });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.normalizedPhone, "+233244112233");
  const record = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: result.messageId } });
  assert.strictEqual(record.status, "submitted");
  assert.strictEqual(record.providerMessageId, null);
  const again = await sendVynfySms({ eventId: event.id, recipientPhone: "0244112233", messageText: "Test", idempotencyKey: key });
  assert.strictEqual(again.status, "duplicate");
  assert.strictEqual(await prisma.communicationMessage.count({ where: { idempotencyKey: key } }), 1);

  const invalid = await sendVynfySms({ eventId: event.id, recipientPhone: "12345", messageText: "Test" });
  assert.strictEqual(invalid.status, "invalid_number");
});
