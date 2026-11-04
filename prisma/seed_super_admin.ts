import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedSuperAdminIntegrations() {
  console.log("Seeding v3.0 Super Admin integrations and provider configurations...");

  // 1. OpenAI (Primary AI)
  const openai = await prisma.platformIntegration.upsert({
    where: { providerKey: "openai" },
    update: {},
    create: {
      providerKey: "openai",
      displayName: "OpenAI API",
      integrationType: "ai",
      status: "healthy",
      environment: "production",
      isEnabled: true,
      metadata: JSON.stringify({
        role: "primary",
        defaultModel: "gpt-4o",
        description: "Primary LLM provider for institutional communications, data summarization, and copy drafting.",
      }),
    },
  });

  await prisma.integrationCredential.create({
    data: {
      integrationId: openai.id,
      secretReference: "vault://production/openai/api-key",
      maskedHint: "sk-proj-...8942",
      credentialVersion: 1,
      status: "active",
    },
  });

  await prisma.aiProviderConfig.upsert({
    where: { provider_taskKey: { provider: "openai", taskKey: "invitation_drafting" } },
    update: {},
    create: {
      provider: "openai",
      model: "gpt-4o",
      taskKey: "invitation_drafting",
      priority: 1,
      isPrimary: true,
      isEnabled: true,
      timeoutMs: 25000,
      maxInputTokens: 4000,
      maxOutputTokens: 2000,
      monthlyBudget: 150.0,
    },
  });

  // 2. Anthropic Claude (Backup AI)
  const anthropic = await prisma.platformIntegration.upsert({
    where: { providerKey: "anthropic" },
    update: {},
    create: {
      providerKey: "anthropic",
      displayName: "Anthropic Claude API",
      integrationType: "ai",
      status: "healthy",
      environment: "production",
      isEnabled: true,
      metadata: JSON.stringify({
        role: "backup",
        defaultModel: "claude-3-5-sonnet-20241022",
        description: "Configured fallback provider for high-availability AI services during OpenAI transient downtime.",
      }),
    },
  });

  await prisma.integrationCredential.create({
    data: {
      integrationId: anthropic.id,
      secretReference: "vault://production/anthropic/api-key",
      maskedHint: "sk-ant-...4419",
      credentialVersion: 1,
      status: "active",
    },
  });

  await prisma.aiProviderConfig.upsert({
    where: { provider_taskKey: { provider: "anthropic", taskKey: "invitation_drafting" } },
    update: {},
    create: {
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      taskKey: "invitation_drafting",
      priority: 2,
      isPrimary: false,
      isEnabled: true,
      timeoutMs: 25000,
      maxInputTokens: 4000,
      maxOutputTokens: 2000,
      monthlyBudget: 100.0,
    },
  });

  // 3. Resend (Email Gateway)
  const resend = await prisma.platformIntegration.upsert({
    where: { providerKey: "resend" },
    update: {},
    create: {
      providerKey: "resend",
      displayName: "Resend",
      integrationType: "email",
      status: "healthy",
      environment: "production",
      isEnabled: true,
      metadata: JSON.stringify({
        verifiedDomain: "parliament.gh",
        senderName: "Parliament of Ghana Protocol Directorate",
        senderEmail: "invitations@parliament.gh",
        replyToEmail: "protocol@parliament.gh",
      }),
    },
  });

  await prisma.integrationCredential.create({
    data: {
      integrationId: resend.id,
      secretReference: "vault://production/resend/api-key",
      maskedHint: "re_...9018",
      credentialVersion: 1,
      status: "active",
    },
  });

  // 4. Vynfy (Designated SMS Gateway)
  const vynfy = await prisma.platformIntegration.upsert({
    where: { providerKey: "vynfy" },
    update: {},
    create: {
      providerKey: "vynfy",
      displayName: "Vynfy SMS Gateway",
      integrationType: "sms",
      status: "healthy",
      environment: "production",
      isEnabled: true,
      metadata: JSON.stringify({
        website: "https://www.vynfy.com/",
        senderId: "PARLIAMENT",
        countryCode: "+233",
        rateLimitPerSec: 25,
        emergencyKillSwitchActive: false,
        accountBalanceEstimate: "GHS 4,850.00",
      }),
    },
  });

  await prisma.integrationCredential.create({
    data: {
      integrationId: vynfy.id,
      secretReference: "vault://production/vynfy/api-key",
      maskedHint: "vyn_live_...3321",
      credentialVersion: 1,
      status: "active",
    },
  });

  // 5. Cloudflare (Infrastructure & Security)
  const cloudflare = await prisma.platformIntegration.upsert({
    where: { providerKey: "cloudflare" },
    update: {},
    create: {
      providerKey: "cloudflare",
      displayName: "Cloudflare Edge & Security",
      integrationType: "infrastructure",
      status: "healthy",
      environment: "production",
      isEnabled: true,
      metadata: JSON.stringify({
        zoneName: "parliament.gh",
        sslMode: "Full (Strict)",
        wafActive: true,
        turnstileActive: true,
        r2Bucket: "parliament-event-assets",
      }),
    },
  });

  await prisma.integrationCredential.create({
    data: {
      integrationId: cloudflare.id,
      secretReference: "vault://production/cloudflare/api-token",
      maskedHint: "cf_tok_...6621",
      credentialVersion: 1,
      status: "active",
    },
  });

  // 6. Super Admin Initial Test Logs
  await prisma.integrationTestLog.createMany({
    data: [
      {
        integrationId: openai.id,
        testType: "auth_validation",
        result: "success",
        latencyMs: 142,
        requestId: "req_openai_test_01",
        testedBy: "system",
      },
      {
        integrationId: anthropic.id,
        testType: "auth_validation",
        result: "success",
        latencyMs: 185,
        requestId: "req_claude_test_01",
        testedBy: "system",
      },
      {
        integrationId: resend.id,
        testType: "test_send",
        result: "success",
        latencyMs: 95,
        requestId: "req_resend_test_01",
        testedBy: "system",
      },
      {
        integrationId: vynfy.id,
        testType: "test_send",
        result: "success",
        latencyMs: 110,
        requestId: "req_vynfy_test_01",
        testedBy: "system",
      },
      {
        integrationId: cloudflare.id,
        testType: "ping",
        result: "success",
        latencyMs: 28,
        requestId: "req_cf_test_01",
        testedBy: "system",
      },
    ],
  });

  console.log("Super Admin integrations seeded successfully!");
}

seedSuperAdminIntegrations()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

