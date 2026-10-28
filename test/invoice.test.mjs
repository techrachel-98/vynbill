import test from "node:test";
import assert from "node:assert/strict";
import { calcTotals, formatMoney, freshInvoice, sanitizeInvoice, addDays } from "../src/lib/invoice.js";
import { demoReply } from "../src/lib/demoParser.js";
import { isPlausibleApiKey } from "../src/lib/apiKey.js";

const base = () => freshInvoice(1, "MYR", "2026-10-01");

test("calcTotals applies discount before tax and rounds to cents", () => {
  const inv = { ...base(), items: [{ description: "x", quantity: 3, rate: 33.33 }], discountPercent: 10, taxPercent: 8 };
  const t = calcTotals(inv);
  assert.equal(t.subtotal, 99.99);
  assert.equal(t.discount, 10);
  assert.equal(t.tax, 7.2);
  assert.equal(t.total, 97.19);
});

test("formatMoney supports only USD and MYR styles", () => {
  assert.equal(formatMoney(1234.5, "USD"), "$1,234.50");
  assert.equal(formatMoney(1234.5, "MYR"), "RM 1,234.50");
});

test("sanitizeInvoice rejects unsupported currency and clamps bad values", () => {
  const inv = sanitizeInvoice(
    { currency: "EUR", dueDate: "not-a-date", taxPercent: 900, items: [{ description: "a", quantity: "2", rate: -5 }], status: "hacked" },
    base(),
  );
  assert.equal(inv.currency, "MYR");
  assert.equal(inv.dueDate, "2026-10-15");
  assert.equal(inv.taxPercent, 100);
  assert.equal(inv.items[0].rate, 0);
  assert.equal(inv.status, "draft");
});

test("demo parser handles the headline example", () => {
  const { invoice, understood } = demoReply("Invoice Acme Studio for 10 hrs design at $50/hr, due in 14 days", base());
  assert.ok(understood);
  assert.equal(invoice.client.name, "Acme Studio");
  assert.equal(invoice.currency, "USD");
  assert.deepEqual(invoice.items, [{ description: "Design", quantity: 10, rate: 50 }]);
  assert.equal(invoice.dueDate, addDays("2026-10-01", 14));
});

test("demo parser reads tax, multiple items, and appends follow-ups", () => {
  const first = demoReply("Bill Kedai Bunga for 3 days consulting at RM800/day and 2 hrs setup at RM150 with 8% SST", freshInvoice(1, "USD", "2026-10-01"));
  assert.equal(first.invoice.items.length, 2);
  assert.equal(first.invoice.taxPercent, 8);
  assert.equal(first.invoice.currency, "MYR");
  const second = demoReply("Add 2 hours of revision at RM100/hr", first.invoice);
  assert.equal(second.invoice.items.length, 3);
});

test("demo parser combines a flat fee with an hourly item, in order", () => {
  const { invoice } = demoReply("Invoice Northwind for a logo design for $450 and 2 hrs revisions at $60/hr", base());
  assert.deepEqual(invoice.items, [
    { description: "Logo design", quantity: 1, rate: 450 },
    { description: "Revisions", quantity: 2, rate: 60 },
  ]);
  assert.equal(calcTotals(invoice).total, 570);
});

test("demo parser refuses other currencies and marks status", () => {
  const refused = demoReply("Invoice Acme for 5 hrs work at EUR 40", base());
  assert.equal(refused.understood, false);
  assert.match(refused.reply, /USD and Malaysian Ringgit/);
  const sent = demoReply("mark as sent", base());
  assert.equal(sent.invoice.status, "sent");
});

test("isPlausibleApiKey accepts Anthropic-style keys and rejects everything else", () => {
  assert.equal(isPlausibleApiKey("sk-ant-api03-" + "a".repeat(40)), true);
  assert.equal(isPlausibleApiKey("  sk-ant-api03-" + "a".repeat(40) + "  "), true);
  assert.equal(isPlausibleApiKey("sk-ant-short"), false);
  assert.equal(isPlausibleApiKey("sk-openai-" + "a".repeat(40)), false);
  assert.equal(isPlausibleApiKey("sk-ant-" + "a".repeat(40) + "\nX-Evil: 1"), false);
  assert.equal(isPlausibleApiKey(null), false);
  assert.equal(isPlausibleApiKey(12345), false);
});
