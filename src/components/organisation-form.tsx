"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveOrganisation } from "@/lib/admin-commands";
import { uploadAttachment } from "@/lib/attachments";
import type { ActionState } from "@/lib/command-support";
import { Banner } from "./banner";
import { Field } from "./editor-bits";
import { OrgMark } from "./org-mark";

const PRESETS = [
  "#c8102e", "#1d4ed8", "#0f766e", "#b45309",
  "#4d7c0f", "#6d28d9", "#be123c", "#334155",
];

export function OrganisationForm({
  name: initialName,
  siteName,
  brandColor: initialColor,
  logoAttachmentId: initialLogo,
}: {
  name: string;
  siteName: string | null;
  brandColor: string;
  logoAttachmentId: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveOrganisation, {});
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [logoId, setLogoId] = useState(initialLogo);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);

  function pickLogo(file: File) {
    setUploadError(null);
    const fd = new FormData();
    fd.set("file", file);
    startUpload(async () => {
      const result = await uploadAttachment(fd);
      if (result.ok) setLogoId(result.id);
      else setUploadError(result.error);
    });
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="logoAttachmentId" value={logoId ?? ""} />

      <section className="card card-pad space-y-4">
        <h2 className="text-[15px] font-semibold tracking-tight">Identity</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" htmlFor="o-name">
            <input id="o-name" name="name" required className="input"
                   value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Site" htmlFor="o-site" hint="Optional.">
            <input id="o-site" name="siteName" className="input" defaultValue={siteName ?? ""} />
          </Field>
        </div>
      </section>

      <section className="card card-pad space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Logo</h2>
          <p className="mt-1 text-[12.5px] text-[var(--ink-soft)]">
            Shown in the navigation and on printed procedures. A square image works best;
            without one your initials are used.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <div
            className="grid place-items-center rounded-lg border p-4"
            style={{ borderColor: "var(--border-strong)", background: "var(--surface-sunk)" }}
          >
            <OrgMark name={name || "Organisation"} logoAttachmentId={logoId} brandColor={color} size={56} />
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Uploading…" : logoId ? "Replace logo" : "Upload a logo"}
            </button>
            {logoId && (
              <button type="button" className="btn" onClick={() => setLogoId(null)}>
                Remove
              </button>
            )}
          </div>
        </div>

        <input
          ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickLogo(f);
            e.target.value = "";
          }}
        />
        {uploadError && <Banner tone="bad">{uploadError}</Banner>}
      </section>

      <section className="card card-pad space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Colour</h2>
          <p className="mt-1 text-[12.5px] text-[var(--ink-soft)]">
            Used for step numbers, buttons and the header bar on documents. Status colours
            on the matrix are fixed — green, amber and red mean the same thing everywhere.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset} type="button"
              onClick={() => setColor(preset)}
              aria-label={`Use ${preset}`}
              aria-pressed={color === preset}
              className="h-8 w-8 rounded-md border-2 transition-transform hover:scale-110"
              style={{ background: preset, borderColor: color === preset ? "var(--ink)" : "transparent" }}
            />
          ))}
          <label className="flex items-center gap-2 ml-2">
            <span className="label">Custom</span>
            <input
              type="color" value={color} onChange={(e) => setColor(e.target.value.toLowerCase())}
              className="h-8 w-12 cursor-pointer rounded border"
              style={{ borderColor: "var(--border-strong)" }}
              aria-label="Custom brand colour"
            />
          </label>
        </div>
        <input type="hidden" name="brandColor" value={color} />
      </section>

      {state.error && <Banner tone="bad">{state.error}</Banner>}
      {state.ok && <Banner tone="good">{state.ok}</Banner>}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
