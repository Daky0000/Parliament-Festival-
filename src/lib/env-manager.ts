import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");

/**
 * Updates or appends key-value pairs to the root .env file and process.env.
 */
export function updateEnvVariables(updates: Record<string, string>): void {
  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8");
  }

  const lines = envContent.split(/\r?\n/);
  const updatedKeys = new Set<string>();

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return line;
    }
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) return line;

    const key = line.slice(0, eqIdx).trim();
    if (key in updates) {
      updatedKeys.add(key);
      const val = updates[key];
      process.env[key] = val;
      return `${key}="${val}"`;
    }
    return line;
  });

  // Append any keys that weren't already present in .env
  for (const [key, val] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      process.env[key] = val;
      newLines.push(`${key}="${val}"`);
    }
  }

  fs.writeFileSync(envPath, newLines.join("\n"), "utf-8");
}

