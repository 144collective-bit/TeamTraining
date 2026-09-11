import { routes } from "@/lib/routes";

/**
 * The organisation's mark: an uploaded logo where one exists, otherwise the
 * initials of its name on the brand colour.
 *
 * There is deliberately no product logo baked into the application. What a
 * shop floor should see at the top of a controlled document is their own
 * company, not their software vendor's.
 */
export function OrgMark({
  name,
  logoAttachmentId,
  brandColor,
  size = 28,
}: {
  name: string;
  logoAttachmentId?: string | null;
  brandColor?: string | null;
  size?: number;
}) {
  if (logoAttachmentId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={routes.attachment(logoAttachmentId)}
        alt={name}
        className="shrink-0 rounded-md object-contain"
        style={{ height: size, width: size, background: "#fff" }}
      />
    );
  }

  return (
    <span
      className="grid shrink-0 place-items-center rounded-md font-bold text-white"
      style={{
        height: size,
        width: size,
        background: brandColor || "var(--accent)",
        fontSize: Math.round(size * 0.44),
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
