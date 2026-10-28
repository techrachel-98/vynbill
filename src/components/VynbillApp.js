"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import InvoiceSheet from "./InvoiceSheet";
import ProfileModal from "./ProfileModal";
import HistoryDrawer from "./HistoryDrawer";
import KeyModal from "./KeyModal";
import { demoReply } from "@/lib/demoParser";
import { freshInvoice, sanitizeInvoice } from "@/lib/invoice";
import { KEY_HEADER, isPlausibleApiKey } from "@/lib/apiKey";

const STORAGE_KEY = "vynbill:v1";
const KEY_STORAGE = "vynbill:session-key";
const GREETING = "Hi! Tell me who you're invoicing and what for, and I'll draft it live on the right. USD and MYR (RM) are supported.";
const SAMPLES = [
  "Invoice Acme Studio for 10 hrs design at $50/hr, due in 14 days",
  "Bill Kedai Bunga Sdn Bhd for 3 days consulting at RM800/day with 8% SST",
  "Invoice Northwind for a logo design for $450 and 2 hrs revisions at $60/hr",
];
const EMPTY_BUSINESS = { name: "", address: "", email: "", bank: "", logo: null };
const BANNERS = {
  no_key: "AI chat isn't configured on this server, so Vynbill is running in offline demo mode.",
  limit: "Demo limit reached, so this answer came from offline demo mode.",
  upstream: "The AI service didn't respond, so this answer came from offline demo mode.",
  bad_output: "The AI reply couldn't be read, so this answer came from offline demo mode.",
  network: "Couldn't reach the server, so this answer came from offline demo mode.",
  bad_key: "Your API key was rejected, so it was removed and this answer came from offline demo mode. Check the key and add it again.",
};

function readSessionKey() {
  try {
    const key = sessionStorage.getItem(KEY_STORAGE);
    return isPlausibleApiKey(key) ? key : "";
  } catch {
    return "";
  }
}

const hasContent = (inv) => Boolean(inv.client.name || inv.items.length);

function readSaved() {
  const fresh = {
    business: EMPTY_BUSINESS,
    invoice: freshInvoice(1),
    history: [],
    counter: 1,
    chat: [{ role: "assistant", text: GREETING }],
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return fresh;
    const counter = Number.isInteger(saved.counter) && saved.counter > 0 ? saved.counter : 1;
    const base = freshInvoice(counter);
    const restore = (inv) => sanitizeInvoice(inv, { ...base, invoiceNumber: String(inv?.invoiceNumber || base.invoiceNumber).slice(0, 20) });
    const chat = Array.isArray(saved.chat)
      ? saved.chat.filter((m) => m && typeof m.text === "string" && (m.role === "user" || m.role === "assistant")).slice(-40)
      : [];
    return {
      counter,
      invoice: saved.invoice ? restore(saved.invoice) : base,
      history: Array.isArray(saved.history) ? saved.history.slice(0, 100).map(restore) : [],
      business: saved.business && typeof saved.business === "object" ? { ...EMPTY_BUSINESS, ...saved.business } : EMPTY_BUSINESS,
      chat: chat.length ? chat : fresh.chat,
    };
  } catch {
    return fresh;
  }
}

export default function VynbillApp() {
  const [initial] = useState(readSaved);
  const [business, setBusiness] = useState(initial.business);
  const [invoice, setInvoice] = useState(initial.invoice);
  const [history, setHistory] = useState(initial.history);
  const [counter, setCounter] = useState(initial.counter);
  const [chat, setChat] = useState(initial.chat);
  const [busy, setBusy] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(null);
  const [banner, setBanner] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [userKey, setUserKey] = useState(readSessionKey);
  const [toast, setToast] = useState(null);
  const logRef = useRef(null);
  const toastTimer = useRef(null);

  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d) => setAiAvailable(Boolean(d.aiAvailable)))
      .catch(() => setAiAvailable(false));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ business, invoice, history, counter, chat: chat.slice(-40) }));
    } catch {
      setTimeout(() => notify("Couldn't save in this browser (storage full?)."), 0);
    }
  }, [business, invoice, history, counter, chat, notify]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, busy]);

  function commit(next) {
    setInvoice(next);
    if (next.status !== "draft") {
      setHistory((h) => [next, ...h.filter((x) => x.invoiceNumber !== next.invoiceNumber)]);
      if (next.status !== invoice.status) notify(`${next.invoiceNumber} marked ${next.status} and filed in History`);
    }
  }

  function storeKey(key) {
    try {
      if (key) sessionStorage.setItem(KEY_STORAGE, key);
      else sessionStorage.removeItem(KEY_STORAGE);
    } catch {
      // Session storage unavailable: the key still works until the page is reloaded.
    }
    setUserKey(key);
  }

  function runDemo(text, reason) {
    const result = demoReply(text, invoice);
    if (reason) setBanner(BANNERS[reason] ?? null);
    commit(result.invoice);
    setChat((c) => [...c, { role: "assistant", text: result.reply }]);
  }

  async function send(raw) {
    const text = raw.trim().slice(0, 2000);
    if (!text || busy) return;
    setBusy(true);
    setChat((c) => [...c, { role: "user", text }]);

    try {
      if (aiAvailable === false && !userKey) {
        runDemo(text, "no_key");
        return;
      }
      const apiMessages = [...chat, { role: "user", text }]
        .map((m) => ({ role: m.role, content: m.text }))
        .slice(-12);
      while (apiMessages.length && apiMessages[0].role !== "user") apiMessages.shift();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(userKey ? { [KEY_HEADER]: userKey } : {}) },
        body: JSON.stringify({ messages: apiMessages, invoice, businessName: business.name }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.mode === "ai") {
        setBanner(null);
        commit(sanitizeInvoice(data.invoice, invoice));
        setChat((c) => [...c, { role: "assistant", text: String(data.reply || "Updated your invoice.") }]);
      } else {
        if (data.reason === "no_key") setAiAvailable(false);
        if (data.reason === "bad_key") storeKey("");
        runDemo(text, data.mode === "demo" ? data.reason : "upstream");
      }
    } catch {
      runDemo(text, "network");
    } finally {
      setBusy(false);
    }
  }

  function newInvoice() {
    const n = hasContent(invoice) ? counter + 1 : counter;
    setCounter(n);
    setInvoice(freshInvoice(n, invoice.currency));
    setChat([{ role: "assistant", text: GREETING }]);
    setBanner(null);
    notify(`Started ${freshInvoice(n).invoiceNumber}`);
  }

  function setCurrency(currency) {
    setInvoice((inv) => (inv.currency === currency ? inv : { ...inv, currency }));
  }

  function openFromHistory(inv) {
    setInvoice(structuredClone(inv));
    setShowHistory(false);
    notify(`Opened ${inv.invoiceNumber}`);
  }

  function printInvoice() {
    notify('In the print dialog, choose "Save as PDF".');
    setTimeout(() => window.print(), 150);
  }

  const showSamples = chat.length <= 1 && !busy;
  const aiMode = Boolean(aiAvailable || userKey);

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand">
          <span className="brand-mark">
            Vyn<span>bill</span>
          </span>
          <span className="brand-tag">PROMPT · DRAFT · SEND</span>
        </div>
        <div className="topbar-actions">
          <span className={`mode ${aiMode ? "mode-ai" : ""}`} title={aiMode ? "Replies come from Claude" : "Rule-based replies, no API key needed"}>
            {aiAvailable === null && !userKey ? "Checking…" : userKey ? "AI mode (your key)" : aiAvailable ? "AI mode" : "Offline demo mode"}
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => setShowKey(true)}>
            {userKey ? "API key ✓" : "Use my API key"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setShowProfile(true)}>
            Business profile
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setShowHistory(true)}>
            History{history.length ? ` (${history.length})` : ""}
          </button>
          <button type="button" className="btn btn-ghost" onClick={newInvoice}>
            New invoice
          </button>
          <button type="button" className="btn btn-primary" onClick={printInvoice} disabled={!hasContent(invoice)}>
            Download PDF
          </button>
        </div>
      </header>

      <main className="main">
        <section className="chat-panel no-print" aria-label="Invoice assistant">
          {banner ? (
            <div className="banner" role="status">
              {banner}
            </div>
          ) : null}
          <div className="chat-log" ref={logRef} role="log" aria-live="polite">
            {chat.map((m, i) => (
              <div key={i} className={`msg msg-${m.role}`}>
                {m.text}
              </div>
            ))}
            {busy ? (
              <div className="typing" aria-label="Assistant is typing">
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>
          {showSamples ? (
            <div className="samples">
              <div className="samples-label">Try one:</div>
              {SAMPLES.map((s) => (
                <button type="button" key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          <ChatInput onSend={send} disabled={busy} />
        </section>

        <section className="invoice-panel" aria-label="Invoice preview">
          <InvoiceSheet invoice={invoice} business={business} onCurrency={setCurrency} />
        </section>
      </main>

      {showProfile ? (
        <ProfileModal
          business={business}
          onClose={() => setShowProfile(false)}
          onError={notify}
          onSave={(b) => {
            setBusiness(b);
            setShowProfile(false);
            notify("Business profile saved");
          }}
        />
      ) : null}
      {showKey ? (
        <KeyModal
          hasKey={Boolean(userKey)}
          onClose={() => setShowKey(false)}
          onSave={(key) => {
            storeKey(key);
            setBanner(null);
            setShowKey(false);
            notify("Using your API key for this tab");
          }}
          onRemove={() => {
            storeKey("");
            setShowKey(false);
            notify("API key removed");
          }}
        />
      ) : null}
      {showHistory ? <HistoryDrawer history={history} onOpen={openFromHistory} onClose={() => setShowHistory(false)} /> : null}
      {toast ? (
        <div className="toast no-print" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState("");
  const submit = () => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
  };
  return (
    <form
      className="chat-input"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        value={value}
        rows={2}
        maxLength={2000}
        placeholder="Tell Vynbill what to invoice…"
        aria-label="Message"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button type="submit" className="send" disabled={disabled || !value.trim()} aria-label="Send">
        ➤
      </button>
    </form>
  );
}
