import Anthropic from "@anthropic-ai/sdk";
import { sanitizeInvoice } from "@/lib/invoice";
import { buildSystemPrompt } from "@/lib/prompt";
import { KEY_HEADER, isPlausibleApiKey } from "@/lib/apiKey";

export const maxDuration = 30;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const MAX_PER_HOUR = Number(process.env.DEMO_MAX_PER_HOUR) || 20;
const MAX_PER_DAY = Number(process.env.DEMO_MAX_PER_DAY) || 300;
const BYOK_MAX_PER_HOUR = 60;
const MAX_BODY_CHARS = 60_000;

// In-memory counters: per server instance only. Good enough to cap a portfolio demo's spend,
// not a substitute for a shared store (e.g. Redis) in production.
// Visitors who bring their own key cost the demo nothing, so they skip the daily cap, but keep a
// per-IP limit so the endpoint can't be used to test lists of guessed keys.
const perIp = new Map();
const perIpByok = new Map();
const daily = { day: "", count: 0 };

function overLimit(ip, byok) {
  const now = Date.now();
  const store = byok ? perIpByok : perIp;
  const max = byok ? BYOK_MAX_PER_HOUR : MAX_PER_HOUR;
  const hits = (store.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (!byok) {
    const day = new Date(now).toISOString().slice(0, 10);
    if (daily.day !== day) {
      daily.day = day;
      daily.count = 0;
    }
  }
  if (hits.length >= max || (!byok && daily.count >= MAX_PER_DAY)) {
    store.set(ip, hits);
    return true;
  }
  hits.push(now);
  store.set(ip, hits);
  if (!byok) daily.count += 1;
  if (store.size > 5000) store.clear();
  return false;
}

const json = (body, status = 200) => Response.json(body, { status });
const demo = (reason, status) => json({ mode: "demo", reason }, status);

export async function GET() {
  return json({ aiAvailable: Boolean(process.env.ANTHROPIC_API_KEY) });
}

function parseModelJson(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(request) {
  // A visitor's own key arrives in a header, is used for this request only, and is never stored or logged.
  const sentKey = request.headers.get(KEY_HEADER);
  let userKey = null;
  if (sentKey !== null) {
    if (!isPlausibleApiKey(sentKey)) return demo("bad_key", 401);
    userKey = sentKey.trim();
  }
  if (!userKey && !process.env.ANTHROPIC_API_KEY) return demo("no_key", 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return json({ error: "Request too large." }, 413);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Malformed request." }, 400);
  }

  const { messages, invoice, businessName } = body ?? {};
  const validMessages =
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.length <= 30 &&
    messages.every(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0 &&
        m.content.length <= 2000,
    ) &&
    messages[messages.length - 1].role === "user" &&
    messages[0].role === "user";
  if (!validMessages || !invoice || typeof invoice !== "object") {
    return json({ error: "Malformed request." }, 400);
  }

  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (overLimit(ip, Boolean(userKey))) return demo("limit", 429);

  const base = sanitizeInvoice(invoice, {
    invoiceNumber: String(invoice.invoiceNumber ?? "VYN-0001").slice(0, 20),
    currency: "MYR",
    date: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    status: "draft",
  });

  try {
    const client = new Anthropic({ apiKey: userKey ?? undefined, timeout: 25_000, maxRetries: 1 });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low" },
      system: buildSystemPrompt({ invoice: base, businessName }),
      messages,
    });

    if (response.stop_reason === "refusal") {
      return json({ mode: "ai", reply: "I can't help with that request. Tell me what to invoice instead.", invoice: base });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const parsed = response.stop_reason === "max_tokens" || !textBlock ? null : parseModelJson(textBlock.text);
    if (!parsed) return demo("bad_output", 502);

    return json({
      mode: "ai",
      reply: typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim().slice(0, 600) : "Updated your invoice.",
      invoice: sanitizeInvoice(parsed.invoice, base),
    });
  } catch (error) {
    if (userKey && (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError)) {
      return demo("bad_key", 401);
    }
    console.error("Anthropic request failed:", error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : error?.message);
    return demo("upstream", 502);
  }
}
