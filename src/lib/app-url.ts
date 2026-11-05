// Public base URL of the deployed app (no trailing slash). Used for absolute
// links and asset URLs in emails. NEXT_PUBLIC_ so it is inlined at build time
// and also works in browser previews.
export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}
