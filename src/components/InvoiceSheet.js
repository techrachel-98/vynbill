import { calcTotals, formatMoney, lineAmount } from "@/lib/invoice";

export default function InvoiceSheet({ invoice, business, onCurrency }) {
  const totals = calcTotals(invoice);
  const money = (n) => formatMoney(n, invoice.currency);

  return (
    <article className="sheet" id="invoice-sheet" aria-label={`Invoice ${invoice.invoiceNumber}`}>
      <div className={`stamp stamp-${invoice.status}`}>{invoice.status}</div>

      <header className="sheet-head">
        <div className="sheet-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded data URL */}
          {business.logo ? <img src={business.logo} alt="Business logo" className="sheet-logo" /> : null}
          <div>
            <div className="sheet-biz">{business.name || "Your Business Name"}</div>
            <div className="sheet-meta">
              {[business.address, business.email].filter(Boolean).join("\n") || "Add your details in Business profile"}
            </div>
          </div>
        </div>
        <div className="sheet-title">
          <h2>INVOICE</h2>
          <div className="sheet-mono">
            No. {invoice.invoiceNumber}
            <br />
            Issued {invoice.date}
            <br />
            Due {invoice.dueDate}
          </div>
          <div className="currency-switch no-print" role="group" aria-label="Invoice currency">
            {["USD", "MYR"].map((c) => (
              <button
                key={c}
                type="button"
                className={invoice.currency === c ? "on" : ""}
                aria-pressed={invoice.currency === c}
                onClick={() => onCurrency(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="sheet-billto">
        <div className="label">Bill to</div>
        {invoice.client.name ? (
          <>
            <div className="client-name">{invoice.client.name}</div>
            <div className="sheet-meta">{[invoice.client.address, invoice.client.email].filter(Boolean).join("\n")}</div>
          </>
        ) : (
          <div className="empty">No client yet</div>
        )}
      </section>

      <table className="items">
        <thead>
          <tr>
            <th>Description</th>
            <th className="num">Qty</th>
            <th className="num">Rate</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.length === 0 ? (
            <tr>
              <td colSpan={4} className="empty">
                No line items yet. Tell the chat what to bill for.
              </td>
            </tr>
          ) : (
            invoice.items.map((item, i) => (
              <tr key={i}>
                <td>{item.description}</td>
                <td className="num mono">{item.quantity}</td>
                <td className="num mono">{money(item.rate)}</td>
                <td className="num mono">{money(lineAmount(item))}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="totals">
        <div className="row">
          <span>Subtotal</span>
          <span>{money(totals.subtotal)}</span>
        </div>
        {invoice.discountPercent ? (
          <div className="row discount">
            <span>Discount ({invoice.discountPercent}%)</span>
            <span>-{money(totals.discount)}</span>
          </div>
        ) : null}
        {invoice.taxPercent ? (
          <div className="row">
            <span>Tax ({invoice.taxPercent}%)</span>
            <span>{money(totals.tax)}</span>
          </div>
        ) : null}
        <div className="row total">
          <span>Total</span>
          <span>{money(totals.total)}</span>
        </div>
      </div>

      <footer className="sheet-foot">
        {invoice.notes ? (
          <>
            <div className="label">Notes</div>
            <div className="foot-text">{invoice.notes}</div>
          </>
        ) : null}
        <div className="label">Payment</div>
        <div className="foot-text mono">{business.bank || "Add bank details in Business profile"}</div>
      </footer>
    </article>
  );
}
