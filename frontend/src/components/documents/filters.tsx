import { useId } from "react";
import { date, eur, parseEuro } from "../../lib/format";
import { type Category, type Company, type Tag } from "./common";

export type Filters = {
  q: string;
  company_id: string;
  doc_type: string;
  category_id: string;
  date_from: string;
  date_to: string;
  amount_min: string;
  amount_max: string;
  tag_ids: number[];
  paid: "" | "ja" | "nein";
  state: string;
  archived: "nein" | "nur" | "ja";
  sort: string;
};

export const EMPTY_FILTERS: Filters = {
  q: "",
  company_id: "",
  doc_type: "",
  category_id: "",
  date_from: "",
  date_to: "",
  amount_min: "",
  amount_max: "",
  tag_ids: [],
  paid: "",
  state: "",
  archived: "nein",
  sort: "datum_ab",
};

export const SORTS: [string, string][] = [
  ["datum_ab", "Datum: neueste zuerst"],
  ["datum_auf", "Datum: älteste zuerst"],
  ["betrag_ab", "Betrag: höchster zuerst"],
  ["betrag_auf", "Betrag: niedrigster zuerst"],
  ["firma", "Firma von A bis Z"],
  ["import_ab", "Zuletzt hinzugefügt"],
];

export const STATES: [string, string][] = [
  ["", "Alle"],
  ["geprueft", "Geprüft"],
  ["erkannt", "Zu prüfen"],
  ["verarbeitet", "Wird erkannt"],
  ["eingegangen", "Neu eingegangen"],
];

export type FilterErrors = Partial<Record<"amount_min" | "amount_max" | "date", string>>;

/** Wandelt die Eingaben in Parameter fuer die API um. Ungueltige Felder werden gemeldet und weggelassen. */
export function buildFilter(f: Filters): { value: Record<string, string | number | boolean | number[]>; errors: FilterErrors } {
  const value: Record<string, string | number | boolean | number[]> = {};
  const errors: FilterErrors = {};
  if (f.q.trim()) value.q = f.q.trim();
  if (f.company_id) value.company_id = Number(f.company_id);
  if (f.doc_type) value.doc_type = f.doc_type;
  if (f.category_id) value.category_id = Number(f.category_id);
  if (f.date_from) value.date_from = f.date_from;
  if (f.date_to) value.date_to = f.date_to;
  if (f.date_from && f.date_to && f.date_from > f.date_to) {
    errors.date = "Das Startdatum liegt nach dem Enddatum.";
    delete value.date_from;
    delete value.date_to;
  }
  for (const k of ["amount_min", "amount_max"] as const) {
    if (!f[k].trim()) continue;
    const c = parseEuro(f[k]);
    if (c === null) errors[k] = "Bitte einen Betrag wie 49,90 eingeben.";
    else value[k] = c;
  }
  if (
    value.amount_min !== undefined &&
    value.amount_max !== undefined &&
    (value.amount_min as number) > (value.amount_max as number)
  ) {
    errors.amount_max = "Der Höchstbetrag ist kleiner als der Mindestbetrag.";
    delete value.amount_min;
    delete value.amount_max;
  }
  if (f.tag_ids.length) value.tag_ids = f.tag_ids;
  if (f.paid) value.paid = f.paid === "ja";
  return { value, errors };
}

type Lookups = { companies: Company[]; categories: Category[]; tags: Tag[] };

/** Aktive Filter als anklickbare Chips; jeder Chip entfernt genau seinen Filter. */
export function activeFilters(f: Filters, l: Lookups, extended: boolean): { key: string; label: string; clear: (f: Filters) => Filters }[] {
  const out: { key: string; label: string; clear: (f: Filters) => Filters }[] = [];
  if (f.q.trim()) out.push({ key: "q", label: `Suche: „${f.q.trim()}“`, clear: (x) => ({ ...x, q: "" }) });
  if (f.company_id) {
    const c = l.companies.find((x) => String(x.id) === f.company_id);
    out.push({ key: "company", label: `Firma: ${c?.name ?? "?"}`, clear: (x) => ({ ...x, company_id: "" }) });
  }
  if (f.doc_type) out.push({ key: "type", label: `Art: ${f.doc_type}`, clear: (x) => ({ ...x, doc_type: "" }) });
  if (f.category_id) {
    const c = l.categories.find((x) => String(x.id) === f.category_id);
    out.push({ key: "cat", label: `Bereich: ${c?.name ?? "?"}`, clear: (x) => ({ ...x, category_id: "" }) });
  }
  if (f.date_from || f.date_to) {
    const label = f.date_from && f.date_to ? `${date(f.date_from)} bis ${date(f.date_to)}` : f.date_from ? `ab ${date(f.date_from)}` : `bis ${date(f.date_to)}`;
    out.push({ key: "date", label: `Datum: ${label}`, clear: (x) => ({ ...x, date_from: "", date_to: "" }) });
  }
  const min = parseEuro(f.amount_min);
  const max = parseEuro(f.amount_max);
  if (min !== null || max !== null) {
    const label = min !== null && max !== null ? `${eur(min)} bis ${eur(max)}` : min !== null ? `ab ${eur(min)}` : `bis ${eur(max)}`;
    out.push({ key: "amount", label: `Betrag: ${label}`, clear: (x) => ({ ...x, amount_min: "", amount_max: "" }) });
  }
  for (const id of f.tag_ids) {
    const t = l.tags.find((x) => x.id === id);
    out.push({ key: `tag${id}`, label: `Tag: ${t?.name ?? "?"}`, clear: (x) => ({ ...x, tag_ids: x.tag_ids.filter((i) => i !== id) }) });
  }
  if (f.paid) out.push({ key: "paid", label: f.paid === "ja" ? "Bezahlt" : "Offen", clear: (x) => ({ ...x, paid: "" }) });
  if (extended) {
    if (f.state) out.push({ key: "state", label: `Stand: ${STATES.find((s) => s[0] === f.state)?.[1] ?? f.state}`, clear: (x) => ({ ...x, state: "" }) });
    if (f.archived !== "nein")
      out.push({
        key: "archived",
        label: f.archived === "nur" ? "Nur Archiv" : "Mit Archiv",
        clear: (x) => ({ ...x, archived: "nein" }),
      });
  }
  return out;
}

export function FilterPanel({
  filters,
  change,
  errors,
  extended,
  docTypes,
  lookups,
}: {
  filters: Filters;
  change: (patch: Partial<Filters>) => void;
  errors: FilterErrors;
  extended: boolean;
  docTypes: string[];
  lookups: Lookups;
}) {
  const id = useId();
  const toggleTag = (tid: number) =>
    change({ tag_ids: filters.tag_ids.includes(tid) ? filters.tag_ids.filter((x) => x !== tid) : [...filters.tag_ids, tid] });
  return (
    <div className="card dx-panel" role="region" aria-label="Filter">
      <div className="dx-grid">
        <div className="field">
          <label htmlFor={`${id}-co`}>Firma</label>
          <select id={`${id}-co`} value={filters.company_id} onChange={(e) => change({ company_id: e.target.value })}>
            <option value="">Alle Firmen</option>
            {lookups.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-ty`}>Art</label>
          <select id={`${id}-ty`} value={filters.doc_type} onChange={(e) => change({ doc_type: e.target.value })}>
            <option value="">Alle Arten</option>
            {docTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-ca`}>Bereich</label>
          <select id={`${id}-ca`} value={filters.category_id} onChange={(e) => change({ category_id: e.target.value })}>
            <option value="">Alle Bereiche</option>
            {lookups.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-pd`}>Bezahlt</label>
          <select id={`${id}-pd`} value={filters.paid} onChange={(e) => change({ paid: e.target.value as Filters["paid"] })}>
            <option value="">Alle</option>
            <option value="ja">Nur bezahlte</option>
            <option value="nein">Nur offene</option>
          </select>
        </div>
        <fieldset className="dx-fieldset">
          <legend>Datum</legend>
          <div className="dx-two">
            <div className="field">
              <label htmlFor={`${id}-df`} className="sr">
                Datum von
              </label>
              <input id={`${id}-df`} type="date" aria-label="Datum von" value={filters.date_from} onChange={(e) => change({ date_from: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-dt`} className="sr">
                Datum bis
              </label>
              <input id={`${id}-dt`} type="date" aria-label="Datum bis" value={filters.date_to} onChange={(e) => change({ date_to: e.target.value })} />
            </div>
          </div>
          {errors.date ? (
            <div className="hint err" role="alert">
              {errors.date}
            </div>
          ) : (
            <div className="hint">Von und bis, zum Beispiel ein ganzes Jahr.</div>
          )}
        </fieldset>
        <fieldset className="dx-fieldset">
          <legend>Betrag in Euro</legend>
          <div className="dx-two">
            <div className="field">
              <input
                type="text"
                inputMode="decimal"
                aria-label="Betrag von"
                placeholder="von, z. B. 10,00"
                value={filters.amount_min}
                aria-invalid={!!errors.amount_min}
                onChange={(e) => change({ amount_min: e.target.value })}
              />
            </div>
            <div className="field">
              <input
                type="text"
                inputMode="decimal"
                aria-label="Betrag bis"
                placeholder="bis, z. B. 100,00"
                value={filters.amount_max}
                aria-invalid={!!errors.amount_max}
                onChange={(e) => change({ amount_max: e.target.value })}
              />
            </div>
          </div>
          {errors.amount_min || errors.amount_max ? (
            <div className="hint err" role="alert">
              {errors.amount_min ?? errors.amount_max}
            </div>
          ) : null}
        </fieldset>
        {extended ? (
          <>
            <div className="field">
              <label htmlFor={`${id}-st`}>Stand</label>
              <select id={`${id}-st`} value={filters.state} onChange={(e) => change({ state: e.target.value })}>
                {STATES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-ar`}>Archiv</label>
              <select id={`${id}-ar`} value={filters.archived} onChange={(e) => change({ archived: e.target.value as Filters["archived"] })}>
                <option value="nein">Archivierte ausblenden</option>
                <option value="ja">Archivierte mit anzeigen</option>
                <option value="nur">Nur Archivierte</option>
              </select>
            </div>
          </>
        ) : null}
      </div>
      <fieldset className="dx-fieldset" style={{ marginBottom: 0 }}>
        <legend>Tags (alle gewählten müssen passen)</legend>
        {lookups.tags.length ? (
          <div className="chips" style={{ margin: 0 }}>
            {lookups.tags.map((t) => (
              <button key={t.id} type="button" className="chip" aria-pressed={filters.tag_ids.includes(t.id)} onClick={() => toggleTag(t.id)}>
                <span className="dx-tag" style={{ border: 0, background: "none", padding: 0, color: "inherit", fontSize: "inherit" }}>
                  <i style={{ background: t.color }} aria-hidden="true" />
                  {t.name}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="hint">Es gibt noch keine Tags. Du kannst sie in einem Dokument anlegen.</div>
        )}
      </fieldset>
    </div>
  );
}
