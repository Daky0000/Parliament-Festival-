// Seed scripts create demo users and data. They must never run against
// production, and they never contain a hardcoded password.
export function assertSeedAllowed(script: string): void {
  const env = process.env.APP_ENV;
  if (!env || env === "production") {
    console.error(
      `${script}: refusing to run (APP_ENV=${env ?? "unset"}). ` +
        "Set APP_ENV to local, ci or staging."
    );
    process.exit(1);
  }
}

export function seedPassword(): string {
  const pw = process.env.SEED_PASSWORD;
  if (!pw || pw.length < 12) {
    console.error("SEED_PASSWORD must be set (12+ characters) to create demo users.");
    process.exit(1);
  }
  return pw;
}
