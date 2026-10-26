"use client";

import { useEffect, useState } from "react";

const MAX_LOGO_BYTES = 500 * 1024;

export default function ProfileModal({ business, onSave, onClose, onError }) {
  const [draft, setDraft] = useState(business);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  function onLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > MAX_LOGO_BYTES) {
      onError("Logo must be an image under 500 KB.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDraft((d) => ({ ...d, logo: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft);
        }}
      >
        <h2 id="profile-title">Business profile</h2>
        <p className="modal-note">Saved in this browser only. Nothing is sent to a server.</p>

        <label className="field">
          <span>Business name</span>
          <input value={draft.name} onChange={set("name")} maxLength={120} autoFocus />
        </label>
        <div className="field">
          <span>Logo (optional)</span>
          <div className="logo-row">
            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded data URL */}
            {draft.logo ? <img src={draft.logo} alt="Logo preview" className="logo-preview" /> : <div className="logo-preview empty">None</div>}
            <label className="btn btn-ghost">
              Upload
              <input type="file" accept="image/*" onChange={onLogo} hidden />
            </label>
            {draft.logo ? (
              <button type="button" className="btn btn-ghost" onClick={() => setDraft((d) => ({ ...d, logo: null }))}>
                Remove
              </button>
            ) : null}
          </div>
        </div>
        <label className="field">
          <span>Address</span>
          <textarea value={draft.address} onChange={set("address")} maxLength={300} rows={2} />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={draft.email} onChange={set("email")} maxLength={120} />
        </label>
        <label className="field">
          <span>Bank / payment details</span>
          <textarea value={draft.bank} onChange={set("bank")} maxLength={300} rows={2} placeholder="Bank name, account number, or payment link" />
        </label>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save profile
          </button>
        </div>
      </form>
    </div>
  );
}
