import test from "node:test";
import assert from "node:assert";
import { generateSecureToken, hashToken, generateReferenceCode, generateQrCodeDataUrl } from "../../src/lib/tokens.ts";

test("Token Security: generates unpredictable 256-bit entropy token and valid SHA-256 hash", () => {
  const token1 = generateSecureToken();
  const token2 = generateSecureToken();

  assert.notStrictEqual(token1.rawToken, token2.rawToken, "Tokens must be unique");
  assert.strictEqual(token1.tokenHash.length, 64, "SHA-256 hash must be 64 hex characters");
  assert.strictEqual(hashToken(token1.rawToken), token1.tokenHash, "Hash must match SHA-256 derivation");
});

test("Reference Code: 8 random Crockford base32 characters (40 bits), not guessable", () => {
  const refs = new Set(Array.from({ length: 2000 }, () => generateReferenceCode("GH-CAROLS")));
  for (const ref of refs) assert.match(ref, /^GH-CAROLS-[0-9A-HJKMNP-TV-Z]{8}$/);
  assert.strictEqual(refs.size, 2000, "no collisions in 2000 codes");
});

test("QR Credential: creates opaque QR code data URL without leaking personal data", async () => {
  const opaqueHash = hashToken("sample-secret-token");
  const dataUrl = await generateQrCodeDataUrl(opaqueHash);

  assert.match(dataUrl, /^data:image\/png;base64,/, "Must return valid PNG Data URL");
  assert.doesNotMatch(dataUrl, /email/, "Must never encode personal email in QR");
  assert.doesNotMatch(dataUrl, /Bagbin/, "Must never encode personal name in QR");
});

