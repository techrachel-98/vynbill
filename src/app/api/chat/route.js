import Anthropic from "@anthropic-ai/sdk";
import { sanitizeInvoice } from "@/lib/invoice";
import { buildSystemPrompt } from "@/lib/prompt";

export const maxDuration = 30;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const MAX_PER_HOUR = Number(process.env.DEMO_MAX_PER_HOUR) || 20;
const MAX_PER_DAY = Number(process.env.DEMO_MAX_PER_DAY) || 300;
const MAX_BODY_CHARS = 60_000;

// In-memory counters: per server instance only. Good enough to cap a portfolio demo's spend,
// not a substitute for a shared store (e.g. Redis) in production.
const perIp = new Map();
const daily = { day: "", count: 0 };

function overLimit(ip) {
  const now = Date.now();
  const hits = (perIp.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  const day = new Date(now).toISOString().slice(0, 10);
  if (daily.day !== day) {
    daily.day = day;
    daily.count = 0;
  }
  if (hits.length >= MAX_PER_HOUR || daily.count >= MAX_PER_DAY) {
    perIp.set(ip, hits);
    return true;
  }
  hits.push(now);
  perIp.set(ip, hits);
  daily.count += 1;
  if (perIp.size > 5000) perIp.clear();
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
  if (!process.env.ANTHROPIC_API_KEY) return demo("no_key", 503);

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
  if (overLimit(ip)) return demo("limit", 429);

  const base = sanitizeInvoice(invoice, {
    invoiceNumber: String(invoice.invoiceNumber ?? "VYN-0001").slice(0, 20),
    currency: "MYR",
    date: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    status: "draft",
  });

  try {
    const client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
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
    console.error("Anthropic request failed:", error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : error?.message);
    return demo("upstream", 502);
  }
}
