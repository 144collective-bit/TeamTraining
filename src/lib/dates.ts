/**
 * Date helpers. Everything the domain stores as a date is a plain ISO day
 * string (YYYY-MM-DD) in UTC — competence expiry, review dates and sign-off
 * dates are calendar facts, not instants, and must not shift with a timezone.
 */

/** Today, as an ISO day string. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** An ISO day string N days before today. */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Add months to an ISO day string (or to today when `from` is omitted).
 *
 * Clamps rather than overflowing: 31 January plus one month is 28/29 February,
 * not 2/3 March. An expiry that silently jumps a month is the kind of thing
 * nobody notices until an audit.
 */
export function addMonths(months: number, from: string = today()): string {
  const [y, m, d] = from.split("-").map(Number);
  const targetMonth = m - 1 + months;
  const year = y + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
