"use client";

import { useEffect, useState } from "react";
import { isPlausibleApiKey } from "@/lib/apiKey";

export default function KeyModal({ hasKey, onSave, onRemove, onClose }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="key-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isPlausibleApiKey(value)) {
            setError("That doesn't look like an Anthropic API key. It should start with sk-ant-.");
            return;
          }
          onSave(value.trim());
        }}
      >
        <h2 id="key-title">Use your own Claude API key</h2>
        <p className="modal-note">
          Optional. Your key is kept in this browser tab only and is forgotten when you close the tab. It is sent to this
          app&apos;s server with each message so it can call Anthropic for you, and it is never stored or logged. Prefer a key with
          a spend limit. Without a key, Vynbill uses its offline demo mode.
        </p>

        <label className="field">
          <span>Anthropic API key</span>
          <input
            type="password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            placeholder={hasKey ? "A key is saved for this tab" : "sk-ant-…"}
            autoComplete="off"
            spellCheck={false}
            maxLength={400}
            autoFocus
          />
        </label>
        {error ? (
          <p className="modal-note" role="alert">
            {error}
          </p>
        ) : null}

        <div className="modal-actions">
          {hasKey ? (
            <button type="button" className="btn btn-ghost" onClick={onRemove}>
              Remove key
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
            Use this key
          </button>
        </div>
      </form>
    </div>
  );
}
