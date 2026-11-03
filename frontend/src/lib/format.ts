const eurFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/** Cent-Betrag als "1.234,56 €". null/undefined ergibt einen Gedankenstrich. */
export function eur(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? "–" : eurFmt.format(cents / 100);
}

/** "1.234,56" oder "49,9" -> Cent; ungueltig -> null. */
export function parseEuro(text: string): number | null {
  const raw = text.replace(/[€\s]/g, "");
  let t = raw;
  if (raw.includes(",")) {
    if (!/^-?[\d.]+,\d{1,2}$/.test(raw)) return null;
    t = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    t = raw.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Cent -> Eingabefeld-Text "1234,56" */
export function centsToInput(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

export function date(iso: string | null | undefined): string {
  if (!iso) return "–";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Tage von heute bis zum Datum (negativ = vorbei). */
export function daysUntil(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const a = new Date(y, m - 1, d).getTime();
  const t = new Date();
  const b = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return Math.round((a - b) / 864e5);
}

export function relativeDays(iso: string): string {
  const n = daysUntil(iso);
  if (n === 0) return "heute";
  if (n === 1) return "morgen";
  if (n === -1) return "gestern";
  return n > 0 ? `in ${n} Tagen` : `vor ${-n} Tagen`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1).replace(".", ",")} MB`;
  return `${(n / 1024 ** 3).toFixed(2).replace(".", ",")} GB`;
}

export const pct = (x: number | null | undefined): string => (x === null || x === undefined ? "–" : `${Math.round(x * 100)} %`);
