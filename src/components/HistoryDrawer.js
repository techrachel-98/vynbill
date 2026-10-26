"use client";

import { useEffect } from "react";
import { calcTotals, formatMoney } from "@/lib/invoice";

export default function HistoryDrawer({ history, onOpen, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay drawer-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Invoice history">
        <div className="drawer-head">
          <h2>Invoice history</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close history">
            ✕
          </button>
        </div>
        <div className="drawer-list">
          {history.length === 0 ? (
            <p className="drawer-empty">No sent invoices yet. Tell the chat to &ldquo;mark as sent&rdquo; to file one here.</p>
          ) : (
            history.map((inv) => (
              <button type="button" key={inv.invoiceNumber} className="history-item" onClick={() => onOpen(inv)}>
                <span className="hi-top">
                  <span>{inv.invoiceNumber}</span>
                  <span className={`badge badge-${inv.status}`}>{inv.status}</span>
                </span>
                <span className="hi-client">{inv.client.name || "No client"}</span>
                <span className="hi-amt">{formatMoney(calcTotals(inv).total, inv.currency)}</span>
              </button>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
