import test from "node:test";
import assert from "node:assert";
import { normalizeGhanaPhone, calculateSmsSegments, sendVynfySms } from "../../src/lib/sms/vynfy.ts";
import { prisma } from "../../src/lib/db.ts";

test("Vynfy SMS Gateway: correctly formats Ghanaian phone numbers to E.164 (+233)", () => {
  assert.strictEqual(normalizeGhanaPhone("0241234567"), "+233241234567");
  assert.strictEqual(normalizeGhanaPhone("241234567"), "+233241234567");
  assert.strictEqual(normalizeGhanaPhone("+233241234567"), "+233241234567");
  assert.strictEqual(normalizeGhanaPhone("233241234567"), "+233241234567");
  assert.strictEqual(normalizeGhanaPhone("050 987 6543"), "+233509876543");
});

test("Vynfy SMS Gateway: calculates GSM 03.38 message segments accurately", () => {
  const shortMsg = "Short invitation message";
  assert.strictEqual(calculateSmsSegments(shortMsg), 1, "Short SMS must be 1 segment");

  const longMsg = "A".repeat(170);
  assert.strictEqual(calculateSmsSegments(longMsg), 2, "170 character SMS must be 2 segments");

  const multiMsg = "A".repeat(320);
  assert.strictEqual(calculateSmsSegments(multiMsg), 3, "320 character SMS must be 3 segments");
});

test("Vynfy SMS Gateway: dispatches message and records communication message in database", async () => {
  const event = await prisma.event.findFirst({ where: { eventCode: "CAROLS-2026" } });
  assert.ok(event, "Active event must exist");

  const result = await sendVynfySms({
    eventId: event.id,
    recipientPhone: "0244112233",
    messageText: "Test parliamentary dispatch via Vynfy gateway",
    senderId: "PARLIAMENT",
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.normalizedPhone, "+233244112233");
  assert.strictEqual(result.segments, 1);
  assert.ok(result.messageId, "Message record must be created in DB");

  const record = await prisma.communicationMessage.findUnique({
    where: { id: result.messageId },
  });
  assert.ok(record);
  assert.strictEqual(record.provider, "vynfy");
  assert.strictEqual(record.channel, "sms");
});

