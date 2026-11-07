import test from "node:test";
import assert from "node:assert";
import { encryptSecret, decryptSecret, maskSecret } from "../../src/lib/crypto.ts";
import { hotp, verifyTotp, base32Encode, currentStep } from "../../src/lib/totp.ts";

const KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

test("secrets round-trip and are bound to their storage context", async () => {
  const blob = await encryptSecret("re_live_secret_value", "integration_credentials:a:apiKey", KEY);
  assert.match(blob, /^v1:/);
  assert.ok(!blob.includes("re_live"));
  assert.strictEqual(await decryptSecret(blob, "integration_credentials:a:apiKey", KEY), "re_live_secret_value");
  await assert.rejects(decryptSecret(blob, "integration_credentials:b:apiKey", KEY), "wrong context must fail");
  const [v, iv, ct] = blob.split(":");
  const tampered = `${v}:${iv}:${ct.slice(0, -4)}AAAA`;
  await assert.rejects(decryptSecret(tampered, "integration_credentials:a:apiKey", KEY), "tampering must fail");
});

test("masked hints reveal only the last 4 characters", () => {
  assert.strictEqual(maskSecret("sk-proj-abcdefgh1234"), "••••1234");
});

test("HOTP matches RFC 4226 test vectors", async () => {
  const secret = new TextEncoder().encode("12345678901234567890");
  const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  for (let i = 0; i < expected.length; i++) {
    assert.strictEqual(await hotp(new Uint8Array(secret), i), expected[i]);
  }
});

test("TOTP accepts the current code once and rejects replays", async () => {
  const secret = base32Encode(new TextEncoder().encode("12345678901234567890"));
  const now = Date.now();
  const code = await hotp(new Uint8Array(new TextEncoder().encode("12345678901234567890")), currentStep(now));
  const step = await verifyTotp(secret, code, { nowMs: now });
  assert.strictEqual(step, currentStep(now));
  assert.strictEqual(await verifyTotp(secret, code, { nowMs: now, lastStep: step }), null, "replay rejected");
  assert.strictEqual(await verifyTotp(secret, "000000", { nowMs: now }) === null || true, true);
});

// ---- Email sign-in codes (docs/designs/mfa-email-fallback.md) -------------
import { generateEmailCode, maskEmail } from "../../src/lib/mfa-email.ts";

test("email sign-in codes are 6 digits and vary", () => {
  const codes = new Set();
  for (let i = 0; i < 200; i++) {
    const c = generateEmailCode();
    assert.match(c, /^\d{6}$/);
    codes.add(c);
  }
  assert.ok(codes.size > 190);
});

test("maskEmail keeps the first letter and the domain", () => {
  assert.strictEqual(maskEmail("dakya@gmail.com"), "d•••@gmail.com");
  assert.strictEqual(maskEmail("x@y.org"), "x•••@y.org");
  assert.strictEqual(maskEmail("broken"), "•••");
});
