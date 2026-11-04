import Anthropic from "@anthropic-ai/sdk";
import { readSession } from "../../lib/auth.js";

const SYSTEM = `You are the Protocol Assistant for the Parliament of Ghana Event & Protocol Platform,
serving the 2026 Festival of Nine Lessons and Carols. Help admins, ushers and protocol staff with
questions about the event, seating, ushering and protocol etiquette. Be concise, warm and formal.
If you do not know a specific detail (times, seat numbers, names), say so and suggest contacting
the protocol office rather than guessing.`;

const MAX_TURNS = 20;
const MAX_CHARS = 4000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function onRequestPost({ request, env }) {
  if (!(await readSession(request, env))) return json({ error: "Sign in to use the assistant." }, 401);
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "The assistant isn't configured yet (missing ANTHROPIC_API_KEY)." }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const messages = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ error: "Please send a message." }, 400);
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return json({ reply: "Sorry, I can't help with that request." });
    }
    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return json({ reply: reply || "Sorry, I didn't get a response. Please try again." });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: "The assistant is busy. Please try again in a moment." }, 429);
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      return json({ error: "The assistant is unavailable right now." }, 502);
    }
    console.error("Agent error", err);
    return json({ error: "Something went wrong." }, 500);
  }
}
