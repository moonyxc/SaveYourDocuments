import { eur } from "../../lib/format";

export type Row = { label: string; sum_cents: number; count: number; share: number };

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const eurShort = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Platzhalter-Beschriftungen der Auswertung (Dokumente ohne Zuordnung). */
export const isUnassigned = (label: string): boolean => /^Ohne /.test(label);

/** Waagerechte Balken. Jede Zeile nennt Name, Summe und Anzahl auch als Text. */
export function BarList({ rows, onPick, limit = 8, name }: { rows: Row[]; onPick?: (label: string) => void; limit?: number; name: string }) {
  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const max = Math.max(...shown.map((r) => r.sum_cents), 1);
  const restSum = rest.reduce((s, r) => s + r.sum_cents, 0);

  const line = (r: Row, key: string, label: string, pick: boolean) => {
    const inner = (
      <>
        <span className="lbl" title={label}>
          {label}
        </span>
        <span className="track" aria-hidden="true">
          <span className="fill" style={{ width: `${Math.max(0, (r.sum_cents / max) * 100)}%`, display: "block" }} />
        </span>
        <span className="v">{eur(r.sum_cents)}</span>
      </>
    );
    return (
      <li key={key}>
        {pick && onPick ? (
          <button className="bar bar-btn" onClick={() => onPick(label)} aria-label={`${label}: ${eur(r.sum_cents)}, ${r.count} Dokumente. Dokumente anzeigen`}>
            {inner}
          </button>
        ) : (
          <div className="bar bar-btn static" aria-label={`${label}: ${eur(r.sum_cents)}, ${r.count} Dokumente`}>
            {inner}
          </div>
        )}
      </li>
    );
  };

  return (
    <ul className="bars list" aria-label={name}>
      {shown.map((r) => line(r, r.label, r.label, !isUnassigned(r.label)))}
      {rest.length
        ? line({ label: "", sum_cents: restSum, count: rest.reduce((s, r) => s + r.count, 0), share: 0 }, "rest", `${rest.length} weitere`, false)
        : null}
    </ul>
  );
}

/** Saeulen pro Jahr; das gewaehlte Jahr ist hervorgehoben und mit "aktuell" beschriftet. */
export function YearColumns({ rows, selected, name }: { rows: Row[]; selected: string; name: string }) {
  const sorted = [...rows].filter((r) => /^\d{4}$/.test(r.label)).sort((a, b) => a.label.localeCompare(b.label));
  const max = Math.max(...sorted.map((r) => r.sum_cents), 1);
  return (
    <div className="yearcols" role="group" aria-label={name}>
      {sorted.map((r) => (
        <div key={r.label} className={`yc ${r.label === selected ? "cur" : ""}`} title={`${r.label}: ${eur(r.sum_cents)}`}>
          <span>{eur(r.sum_cents)}</span>
          <div style={{ height: `${Math.max(0, (r.sum_cents / max) * 78)}%` }} aria-hidden="true" />
          <span>{r.label === selected ? `${r.label} ●` : r.label}</span>
        </div>
      ))}
    </div>
  );
}

export type MonthPoint = { key: string; label: string; sum_cents: number; count: number };

/** Monate eines Jahres (alle 12) oder die letzten Monate mit Daten. */
export function monthPoints(rows: Row[], year: string): MonthPoint[] {
  const by = new Map(rows.map((r) => [r.label, r]));
  if (year !== "alle") {
    return MONTHS.map((m, i) => {
      const key = `${year}-${String(i + 1).padStart(2, "0")}`;
      const r = by.get(key);
      return { key, label: m, sum_cents: r?.sum_cents ?? 0, count: r?.count ?? 0 };
    });
  }
  return [...rows]
    .filter((r) => /^\d{4}-\d{2}$/.test(r.label))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(-24)
    .map((r) => ({
      key: r.label,
      label: `${MONTHS[Number(r.label.slice(5)) - 1]} ${r.label.slice(2, 4)}`,
      sum_cents: r.sum_cents,
      count: r.count,
    }));
}

export function MonthColumns({ points, name }: { points: MonthPoint[]; name: string }) {
  const max = Math.max(...points.map((p) => p.sum_cents), 1);
  return (
    <div className="yearcols months" role="group" aria-label={name}>
      {points.map((p) => (
        <div key={p.key} className="yc" title={`${p.label}: ${eur(p.sum_cents)}, ${p.count} Dokumente`}>
          <span>{p.sum_cents ? eurShort.format(p.sum_cents / 100) : "\u00a0"}</span>
          <div style={{ height: `${Math.max(0, (p.sum_cents / max) * 78)}%` }} aria-hidden="true" />
          <span>{p.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Textalternative zu den Saeulen: dieselben Zahlen als Tabelle. */
export function MonthTable({ points }: { points: MonthPoint[] }) {
  return (
    <details className="alt">
      <summary>Zahlen als Tabelle anzeigen</summary>
      <table className="tbl">
        <caption className="sr">Summe und Anzahl Dokumente pro Monat</caption>
        <thead>
          <tr>
            <th scope="col">Monat</th>
            <th scope="col" className="num">
              Dokumente
            </th>
            <th scope="col" className="num">
              Summe
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <td>{p.label}</td>
              <td className="num">{p.count}</td>
              <td className="num">{eur(p.sum_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
