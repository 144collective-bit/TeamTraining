export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-10 border-b px-5 py-4 sm:px-7 sm:py-5 backdrop-blur"
      style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--canvas) 88%, transparent)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow && <p className="label mb-1">{eyebrow}</p>}
          <h1 className="text-[22px] font-semibold tracking-tight leading-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-[13.5px] text-[var(--ink-soft)] max-w-2xl">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 no-print">{actions}</div>}
      </div>
    </header>
  );
}
