import { addDays, formatMoney, sanitizeInvoice } from "./invoice.js";

const MONEY = "(?:rm|myr|usd|us\\$|\\$)?\\s*(\\d[\\d,]*(?:\\.\\d+)?)";
const UNITS = "(?:hrs?|hours?|days?|units?|pcs?|pieces?|items?|x)";
const ITEM_WITH_QTY = new RegExp(
  `(\\d+(?:\\.\\d+)?)\\s*${UNITS}?\\s*(?:of\\s+)?([a-z][a-z \\-&/]*?)\\s+(?:at|@)\\s*${MONEY}`,
  "gi",
);
const ITEM_FLAT = new RegExp(
  `(?:^|[,;]|\\band\\b)\\s*(?:a|an|one)?\\s*([a-z][a-z \\-&/]*?)\\s+(?:for|at|@)\\s*(?:rm|myr|usd|us\\$|\\$)\\s*(\\d[\\d,]*(?:\\.\\d+)?)`,
  "gi",
);
const CLIENT = /\b(?:invoice|bill)\s+(?:to\s+)?(.+?)\s+for\b/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const OTHER_CURRENCY = /\b(eur|gbp|sgd|aud|cad|jpy|inr|cny|euros?|pounds?|yen)\b|[€£¥]/i;

const toNumber = (s) => Number(String(s).replace(/,/g, ""));
const capitalise = (s) => s.trim().replace(/^./, (c) => c.toUpperCase());

function detectCurrency(text, current) {
  const usd = /\busd(?![a-z])|\bdollars?\b|\$/i.test(text);
  const myr = /\b(?:myr|rm)(?![a-z])|\bringgit\b/i.test(text);
  if (usd && !myr) return "USD";
  if (myr && !usd) return "MYR";
  return current;
}

function parseItems(text) {
  const found = [];
  let rest = text;
  for (const m of text.matchAll(ITEM_WITH_QTY)) {
    found.push({ at: m.index, item: { description: capitalise(m[2]), quantity: toNumber(m[1]), rate: toNumber(m[3]) } });
    // Blank out the matched span (keeping indices) so flat-fee parsing doesn't see it again.
    rest = rest.slice(0, m.index) + ",".padEnd(m[0].length, " ") + rest.slice(m.index + m[0].length);
  }
  for (const m of rest.matchAll(ITEM_FLAT)) {
    found.push({ at: m.index, item: { description: capitalise(m[1]), quantity: 1, rate: toNumber(m[2]) } });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.item);
}

function parseDue(text, invoice) {
  let m = text.match(/\bdue\s+in\s+(\d+)\s+(days?|weeks?)\b/i);
  if (m) return addDays(invoice.date, Number(m[1]) * (/^week/i.test(m[2]) ? 7 : 1));
  m = text.match(/\bnet\s*(\d+)\b/i);
  if (m) return addDays(invoice.date, Number(m[1]));
  m = text.match(/\bdue\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})\b/i);
  if (m && !Number.isNaN(Date.parse(m[1]))) return m[1];
  return null;
}

function parsePercent(text, words) {
  const after = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*%\\s*(?:${words})\\b`, "i");
  const before = new RegExp(`\\b(?:${words})\\s*(?:of|at|@|:)?\\s*(\\d+(?:\\.\\d+)?)\\s*%`, "i");
  const m = text.match(after) ?? text.match(before);
  return m ? Number(m[1]) : null;
}

const HELP =
  'I can build invoices from sentences like "Invoice Acme Studio for 10 hrs design at $50/hr, due in 14 days" or "Bill Kedai Bunga for 3 days consulting at RM800/day with 8% SST". Add items with "Add 2 hours of revision at $60/hr", or say "mark as sent".';

// Rule-based stand-in for the AI chat, so the demo works with no API key. Understands a fixed set of phrasings.
export function demoReply(message, invoice) {
  const text = String(message || "");
  const next = structuredClone(invoice);
  const notes = [];

  if (OTHER_CURRENCY.test(text)) {
    return { reply: "Only USD and Malaysian Ringgit (RM) are supported. Tell me the amounts in one of those.", invoice, understood: false };
  }

  const currency = detectCurrency(text, next.currency);
  if (currency !== next.currency) {
    next.currency = currency;
    notes.push(`currency set to ${currency}`);
  }

  const clientMatch = text.match(CLIENT);
  let itemText = text;
  if (clientMatch) {
    const email = text.match(EMAIL)?.[0];
    const name = clientMatch[1].replace(EMAIL, "").replace(/[()<>,]/g, "").trim();
    if (name) {
      next.client.name = name;
      notes.push(`client is ${name}`);
    }
    if (email) next.client.email = email;
    itemText = text.slice(clientMatch.index + clientMatch[0].length);
  }

  const items = parseItems(itemText);
  if (items.length > 0) {
    next.items = clientMatch ? items : [...next.items, ...items];
    const total = items.reduce((sum, it) => sum + it.quantity * it.rate, 0);
    notes.push(`${clientMatch ? "set" : "added"} ${items.length} line item${items.length > 1 ? "s" : ""} (${formatMoney(total, next.currency)})`);
  } else if (/\b(?:remove|delete)\s+(?:the\s+)?last\s+item\b/i.test(text) && next.items.length > 0) {
    const removed = next.items.pop();
    notes.push(`removed "${removed.description}"`);
  }

  const due = parseDue(text, next);
  if (due) {
    next.dueDate = due;
    notes.push(`due ${due}`);
  }

  const tax = parsePercent(text, "sst|tax|gst|vat|sales tax");
  if (tax !== null) {
    next.taxPercent = tax;
    notes.push(`tax ${tax}%`);
  }
  const discount = parsePercent(text, "discount|off");
  if (discount !== null) {
    next.discountPercent = discount;
    notes.push(`discount ${discount}%`);
  }

  const noteMatch = text.match(/\bnotes?\s*[:\-]\s*(.+)$/i);
  if (noteMatch) {
    next.notes = noteMatch[1].trim();
    notes.push("added your note");
  }

  const status = text.match(/\b(?:mark(?:ed)?|set)\b.*?\b(?:as\s+)?(sent|paid)\b/i) ?? text.match(/\b(?:has|have|been|it'?s)\s+(paid)\b/i);
  if (status) {
    next.status = status[1].toLowerCase();
    notes.push(`marked ${next.status}`);
  }

  if (notes.length === 0) {
    return { reply: `I didn't catch any invoice details in that. ${HELP}`, invoice, understood: false };
  }

  const missing = [];
  if (!next.client.name) missing.push("who it's for");
  if (next.items.length === 0) missing.push("what to bill");
  const reply = `Done: ${notes.join(", ")}.${missing.length ? ` Still need ${missing.join(" and ")}.` : " Anything else to change?"}`;
  return { reply, invoice: sanitizeInvoice(next, invoice), understood: true };
}

export { HELP as DEMO_HELP };
