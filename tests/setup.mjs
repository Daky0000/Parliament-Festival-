// Loaded before every test file. Tests must never reach real providers, even
// if a developer's .env holds live keys (Prisma auto-loads .env).
for (const key of [
  "RESEND_API_KEY",
  "VYNFY_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "CLOUDFLARE_API_TOKEN",
]) {
  process.env[key] = "";
}
process.env.EMAIL_PROVIDER = "mock";
process.env.SMS_PROVIDER = "mock";
process.env.APP_ENV ||= "ci";
