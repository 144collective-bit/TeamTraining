"use client";

import { useRef, useState, useTransition } from "react";
import { uploadAttachment } from "@/lib/attachments";
import { routes } from "@/lib/routes";

/* ------------------------------------------------------------------ *
 * Tag input - PPE, hazards
 * ------------------------------------------------------------------ */

export function TagInput({
  label,
  values,
  onChange,
  placeholder,
  suggestions = [],
  tone = "default",
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  tone?: "default" | "hazard";
}) {
  const [draft, setDraft] = useState("");

  function add(value: string) {
    const v = value.trim();
    if (!v || values.includes(v)) { setDraft(""); return; }
    onChange([...values, v]);
    setDraft("");
  }

  const unused = suggestions.filter((s) => !values.includes(s));

  return (
    <div>
      <p className="label mb-1.5">{label}</p>
      {values.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <li key={v}>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]"
                style={
                  tone === "hazard"
                    ? { background: "var(--st-suspended-bg)", color: "var(--st-suspended-fg)", borderColor: "var(--st-suspended-br)" }
                    : { background: "var(--surface-sunk)", borderColor: "var(--border-strong)" }
                }
              >
                {v}
                <button
                  type="button"
                  onClick={() => onChange(values.filter((x) => x !== v))}
                  aria-label={`Remove ${v}`}
                  className="opacity-60 hover:opacity-100"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
          }}
          placeholder={placeholder}
          className="input"
          aria-label={`Add ${label.toLowerCase()}`}
        />
        <button type="button" className="btn shrink-0" onClick={() => add(draft)} disabled={!draft.trim()}>
          Add
        </button>
      </div>

      {unused.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {unused.slice(0, 8).map((s) => (
            <button
              key={s} type="button" onClick={() => add(s)}
              className="rounded-full border px-2 py-0.5 text-[11.5px] text-[var(--ink-soft)] hover:bg-[var(--surface-sunk)]"
              style={{ borderColor: "var(--border)" }}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Bullet list - key points, reasons, controls
 * ------------------------------------------------------------------ */

export function ListInput({
  label,
  values,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
}) {
  function set(i: number, v: string) {
    const next = [...values];
    next[i] = v;
    onChange(next);
  }

  return (
    <div>
      <p className="label mb-1">{label}</p>
      {hint && <p className="mb-1.5 text-[11.5px] text-[var(--ink-faint)]">{hint}</p>}
      <ul className="space-y-1.5">
        {values.map((v, i) => (
          <li key={i} className="flex gap-1.5">
            <input
              value={v}
              onChange={(e) => set(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onChange([...values.slice(0, i + 1), "", ...values.slice(i + 1)]);
                }
              }}
              placeholder={placeholder}
              className="input !h-8 text-[13px]"
              aria-label={`${label} ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => onChange(values.filter((_, n) => n !== i))}
              aria-label={`Remove ${label} ${i + 1}`}
              className="btn !h-8 !px-2 shrink-0"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn !h-8 mt-1.5 text-[12.5px]" onClick={() => onChange([...values, ""])}>
        Add {label.toLowerCase().replace(/s$/, "")}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Photograph
 * ------------------------------------------------------------------ */

export function ImagePicker({
  imageId,
  caption,
  onChange,
  stepNumber,
}: {
  imageId: string | null;
  caption: string | null;
  onChange: (next: { imageId: string | null; imageCaption: string | null }) => void;
  stepNumber: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pick(file: File) {
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const result = await uploadAttachment(fd);
      if (result.ok) onChange({ imageId: result.id, imageCaption: caption });
      else setError(result.error);
    });
  }

  return (
    <div>
      <p className="label mb-1.5">Photograph</p>

      {imageId ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={routes.attachment(imageId)}
            alt={caption ?? `Step ${stepNumber}`}
            className="w-full rounded-md border object-cover"
            style={{ height: "9rem", borderColor: "var(--border-strong)" }}
          />
          <input
            value={caption ?? ""}
            onChange={(e) => onChange({ imageId, imageCaption: e.target.value || null })}
            placeholder="Caption (optional)"
            className="input !h-8 text-[12.5px]"
            aria-label={`Caption for step ${stepNumber} photograph`}
          />
          <div className="flex gap-2">
            <button type="button" className="btn !h-8 text-[12px]" onClick={() => inputRef.current?.click()}>
              Replace
            </button>
            <button
              type="button" className="btn !h-8 text-[12px]"
              onClick={() => onChange({ imageId: null, imageCaption: null })}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="flex w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed py-6 text-[12.5px] transition-colors hover:bg-[var(--surface-sunk)]"
          style={{ borderColor: "var(--border-strong)", color: "var(--ink-faint)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="8.5" cy="10" r="1.5" />
            <path d="m21 15-4.5-4.5L9 18" />
          </svg>
          {pending ? "Uploading…" : "Add a photo of this step"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
          e.target.value = "";
        }}
      />

      {error && (
        <p role="alert" className="mt-1.5 text-[12px]" style={{ color: "var(--st-suspended-fg)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Field
 * ------------------------------------------------------------------ */

export function Field({
  label, hint, children, htmlFor,
}: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label mb-1.5 block" htmlFor={htmlFor}>{label}</label>
      {hint && <p className="mb-1.5 text-[11.5px] text-[var(--ink-faint)]">{hint}</p>}
      {children}
    </div>
  );
}
