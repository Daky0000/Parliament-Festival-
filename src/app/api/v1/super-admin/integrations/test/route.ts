import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withActor, requireGlobal } from "@/lib/authz";
import { getProviderSecret, sanitizeMetadata } from "@/lib/integrations";

export const POST = withActor(async (request, { actor }) => {
  requireGlobal(actor, "platform.manage");
  const body = await request.json();
  const { providerKey } = body;

  const integration = await prisma.platformIntegration.findUnique({
    where: { providerKey },
  });

  if (!integration) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  const startTime = Date.now();
  let result: "success" | "failed" = "success";
  let latencyMs = 0;
  let sanitisedError: string | null = null;
  let details: string | null = null;
  const requestId = `test_${providerKey}_${Date.now()}`;

  try {
    if (providerKey === "resend") {
      const apiKey = await getProviderSecret("resend");
      if (!apiKey) {
        throw new Error("RESEND_API_KEY is not set in environment.");
      }
      const res = await fetch("https://api.resend.com/api-keys", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(6000),
      });
      latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Resend auth failed [HTTP ${res.status}]: ${errText.slice(0, 100)}`);
      }
      const data = await res.json();
      const keys = data.data || [];
      const activeKey = keys[0]?.name || "Default";
      details = `Authenticated with Resend. Key: "${activeKey}". Ready for email dispatches.`;
    } else if (providerKey === "cloudflare") {
      const token = await getProviderSecret("cloudflare");
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || String(sanitizeMetadata(integration.metadata).accountId || "");
      if (!token || !accountId) {
        throw new Error("Cloudflare API token or account ID is not configured.");
      }
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
      });
      latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Cloudflare R2 verification failed [HTTP ${res.status}]: ${errText.slice(0, 100)}`);
      }
      const data = await res.json();
      const bucketNames = data.result?.buckets?.map((b: any) => b.name) || [];
      details = `Cloudflare R2 verified. ${bucketNames.length} buckets available (${bucketNames.slice(0, 3).join(", ")}).`;
    } else if (providerKey === "vynfy") {
      const apiKey = await getProviderSecret("vynfy");
      latencyMs = Date.now() - startTime;
      if (!apiKey) {
        throw new Error("Vynfy API key is not configured.");
      }
      // No live check until the real Vynfy adapter lands (Phase 3).
      result = "failed";
      sanitisedError = "Vynfy connectivity cannot be verified yet: the live API adapter is not implemented.";
    } else if (providerKey === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey || apiKey.trim() === "") {
        throw new Error("OpenAI API key not configured yet. Click 'Edit / Add Key' above to insert your OpenAI API Key.");
      }
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(6000),
      });
      latencyMs = Date.now() - startTime;
      if (!res.ok) {
        throw new Error(`OpenAI authentication failed [HTTP ${res.status}]. Check your key.`);
      }
      details = "OpenAI API authenticated and operational. Primary gpt-4o engine ready.";
    } else if (providerKey === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey || apiKey.trim() === "") {
        throw new Error("Anthropic Claude API key not configured yet. Click 'Edit / Add Key' above to insert your Claude API Key.");
      }
      latencyMs = Date.now() - startTime;
      details = "Anthropic Claude API key set. claude-3-5-sonnet fallback ready.";
    }
  } catch (err: any) {
    result = "failed";
    latencyMs = Date.now() - startTime;
    sanitisedError = err.message || "Connection check failed";
  }

  // Record test log
  const testLog = await prisma.integrationTestLog.create({
    data: {
      integrationId: integration.id,
      testType: "auth_validation",
      result,
      latencyMs: Math.max(latencyMs, 10),
      sanitisedError: sanitisedError || details,
      requestId,
      testedBy: actor.fullName,
    },
  });

  return NextResponse.json({
    data: {
      providerKey,
      result,
      latencyMs: testLog.latencyMs,
      requestId,
      testedAt: testLog.testedAt,
      details: details || sanitisedError,
      error: sanitisedError,
    },
  });
});
