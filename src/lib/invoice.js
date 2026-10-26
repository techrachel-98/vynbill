export const CURRENCIES = ["USD", "MYR"];
export const STATUSES = ["draft", "sent", "paid"];

const LIMITS = { name: 120, address: 300, email: 120, notes: 1000, desc: 200, items: 30 };

export function todayISO(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function invoiceNumber(counter) {
  return `VYN-${String(counter).padStart(4, "0")}`;
}

export function freshInvoice(counter, currency = "MYR", today = todayISO()) {
  return {
    invoiceNumber: invoiceNumber(counter),
    currency,
    date: today,
    dueDate: addDays(today, 14),
    client: { name: "", email: "", address: "" },
    items: [],
    taxPercent: 0,
    discountPercent: 0,
    notes: "",
    status: "draft",
  };
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineAmount(item) {
  return round2((Number(item.quantity) || 0) * (Number(item.rate) || 0));
}

export function calcTotals(inv) {
  const subtotal = round2(inv.items.reduce((sum, item) => sum + lineAmount(item), 0));
  const discount = round2(subtotal * ((Number(inv.discountPercent) || 0) / 100));
  const taxable = round2(subtotal - discount);
  const tax = round2(taxable * ((Number(inv.taxPercent) || 0) / 100));
  return { subtotal, discount, tax, total: round2(taxable + tax) };
}

export function formatMoney(amount, currency) {
  const n = Number(amount) || 0;
  const body = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const symbol = currency === "USD" ? "$" : "RM ";
  return `${n < 0 ? "-" : ""}${symbol}${body}`;
}

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const num = (value, min, max) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
};
const isoDate = (value, fallback) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
    ? value
    : fallback;

// Turns untrusted data (model output, localStorage) into a valid invoice; `base` supplies fallbacks.
export function sanitizeInvoice(raw, base) {
  const src = raw && typeof raw === "object" ? raw : {};
  const client = src.client && typeof src.client === "object" ? src.client : {};
  const items = Array.isArray(src.items) ? src.items.slice(0, LIMITS.items) : [];

  return {
    invoiceNumber: base.invoiceNumber,
    currency: CURRENCIES.includes(src.currency) ? src.currency : base.currency,
    date: isoDate(src.date, base.date),
    dueDate: isoDate(src.dueDate, base.dueDate),
    client: {
      name: text(client.name, LIMITS.name),
      email: text(client.email, LIMITS.email),
      address: text(client.address, LIMITS.address),
    },
    items: items
      .map((item) => ({
        description: text(item?.description, LIMITS.desc),
        quantity: num(item?.quantity, 0, 1_000_000),
        rate: num(item?.rate, 0, 1_000_000_000),
      }))
      .filter((item) => item.description || item.quantity || item.rate),
    taxPercent: num(src.taxPercent, 0, 100),
    discountPercent: num(src.discountPercent, 0, 100),
    notes: text(src.notes, LIMITS.notes),
    status: STATUSES.includes(src.status) ? src.status : base.status,
  };
}
