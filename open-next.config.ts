import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Defaults: no incremental cache. Every page in this app is dynamic
// (per-user, per-event data), so ISR caching is not used.
export default defineCloudflareConfig();
