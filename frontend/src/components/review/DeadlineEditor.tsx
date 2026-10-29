import { Badge } from "../ui";
import { date as fmtDate } from "../../lib/format";
import { DEADLINE_LABEL, type Deadline } from "./types";

export type DeadlineDraft = {
  key: string;
  id?: number;
  type: string;
  due_date: string;
  repeat_months: number;
  lead_text: string;
  accepted: boolean;
  removed: boolean;
  recognised: boolean;
  confidence: number | null;
  leadTouched: boolean;
};

const REPEATS: [number, string][] = [
  [0, "Keine Wiederholung"],
  [1, "Jeden Monat"],
  [3, "Alle 3 Monate"],
  [6, "Alle 6 Monate"],
  [12, "Jedes Jahr"],
  [24, "Alle 2 Jahre"],
];

let seq = 0;

export const leadsToText = (leads: number[]): string => leads.join(", ");

/** "7, 1" -> [7, 1]; null bei ungueltiger Eingabe. */
export function parseLeads(text: string): number[] | null {
  const parts = text.split(/[,;\s]+/).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 365) return null;
    out.push(Number(p));
  }
  return [...new Set(out)].sort((a, b) => b - a);
}

export function draftsFromServer(list: Deadline[]): DeadlineDraft[] {
  return list.map((d) => ({
    key: `s${d.id}`,
    id: d.id,
    type: d.type,
    due_date: d.due_date,
    repeat_months: d.repeat_months,
    lead_text: leadsToText(d.lead_days),
    accepted: d.confirmed,
    removed: false,
    recognised: d.source !== "manuell",
    confidence: d.confidence,
    leadTouched: true,
  }));
}

export function newDraft(defaults: Record<string, number[]>): DeadlineDraft {
  return {
    key: `n${++seq}`,
    type: "zahlungsziel",
    due_date: "",
    repeat_months: 0,
    lead_text: leadsToText(defaults.zahlungsziel ?? [7, 1]),
    accepted: true,
    removed: false,
    recognised: false,
    confidence: null,
    leadTouched: false,
  };
}

/** Fristen fuer POST /confirm. Nicht bestaetigte Fristen werden nicht uebergeben. */
export function deadlineSpecs(drafts: DeadlineDraft[]): { specs: Record<string, unknown>[]; error: string | null } {
  const specs: Record<string, unknown>[] = [];
  for (const d of drafts) {
    if (d.removed) {
      if (d.id) specs.push({ id: d.id, remove: true });
      continue;
    }
    if (!d.accepted) continue;
    const leads = parseLeads(d.lead_text);
    if (!d.due_date) return { specs, error: `Bitte ein Datum für die Frist „${DEADLINE_LABEL[d.type] ?? d.type}“ eintragen oder die Frist entfernen.` };
    if (leads === null) return { specs, error: "Die Erinnerung besteht aus ganzen Tagen, zum Beispiel „7, 1“." };
    specs.push({ ...(d.id ? { id: d.id } : {}), type: d.type, due_date: d.due_date, repeat_months: d.repeat_months, lead_days: leads });
  }
  return { specs, error: null };
}

export function DeadlineEditor({
  drafts,
  onChange,
  types,
  defaults,
  threshold,
  idPrefix,
}: {
  drafts: DeadlineDraft[];
  onChange: (d: DeadlineDraft[]) => void;
  types: string[];
  defaults: Record<string, number[]>;
  threshold: number;
  idPrefix: string;
}) {
  const visible = drafts.filter((d) => !d.removed);
  const patch = (key: string, p: Partial<DeadlineDraft>) => onChange(drafts.map((d) => (d.key === key ? { ...d, ...p } : d)));

  return (
    <div className="rv-sect">
      <div className="row spread wrap">
        <h2>Fristen</h2>
        <button className="btn secondary small" type="button" onClick={() => onChange([...drafts, newDraft(defaults)])}>
          Frist hinzufügen
        </button>
      </div>
      {visible.length === 0 ? <p className="muted" style={{ margin: 0 }}>In diesem Dokument wurde keine Frist erkannt. Fristen bestätigst du immer selbst, nur dafür gibt es Erinnerungen.</p> : null}
      {visible.map((d, i) => {
        const leads = parseLeads(d.lead_text);
        const lowConf = d.recognised && !d.accepted && (d.confidence ?? 0) < threshold;
        const cls = d.accepted ? "confirmed" : "unsure";
        const id = `${idPrefix}-${d.key}`;
        const typeOptions = types.includes(d.type) ? types : [d.type, ...types];
        return (
          <div className={`rv-box ${cls}`} key={d.key} role="group" aria-label={`Frist ${i + 1}: ${DEADLINE_LABEL[d.type] ?? d.type}`}>
            <div className="row spread wrap">
              <span className="row" style={{ gap: "0.5rem" }}>
                {d.accepted ? <Badge tone="green">✓ bestätigt</Badge> : <Badge tone="yellow">▲ noch nicht bestätigt</Badge>}
                {d.recognised && d.confidence !== null ? (
                  <span className="conf muted">{lowConf ? "bitte prüfen " : "erkannt "}{Math.round(d.confidence * 100)} %</span>
                ) : null}
              </span>
              <button className="btn ghost small" type="button" onClick={() => patch(d.key, { removed: true })} aria-label={`Frist ${i + 1} entfernen`}>
                Entfernen
              </button>
            </div>
            <div className="rv-two">
              <div className="field">
                <label htmlFor={`${id}-t`}>Art der Frist</label>
                <select
                  id={`${id}-t`}
                  value={d.type}
                  onChange={(e) => {
                    const type = e.target.value;
                    patch(d.key, { type, ...(d.leadTouched ? {} : { lead_text: leadsToText(defaults[type] ?? [7, 1]) }) });
                  }}
                >
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>
                      {DEADLINE_LABEL[t] ?? t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${id}-d`}>Datum</label>
                <input id={`${id}-d`} type="date" value={d.due_date} onChange={(e) => patch(d.key, { due_date: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`${id}-r`}>Wiederholung</label>
                <select id={`${id}-r`} value={d.repeat_months} onChange={(e) => patch(d.key, { repeat_months: Number(e.target.value) })}>
                  {(REPEATS.some(([v]) => v === d.repeat_months) ? REPEATS : [...REPEATS, [d.repeat_months, `Alle ${d.repeat_months} Monate`] as [number, string]]).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${id}-l`}>Erinnern (Tage vorher)</label>
                <input
                  id={`${id}-l`}
                  inputMode="numeric"
                  className={leads === null ? "invalid" : ""}
                  aria-invalid={leads === null}
                  aria-describedby={`${id}-lh`}
                  value={d.lead_text}
                  placeholder="7, 1"
                  onChange={(e) => patch(d.key, { lead_text: e.target.value, leadTouched: true })}
                />
              </div>
            </div>
            <div className="hint" id={`${id}-lh`} style={{ marginTop: "-0.25rem" }}>
              {leads === null
                ? "Bitte ganze Tage mit Komma trennen, zum Beispiel „7, 1“."
                : d.due_date && leads.length
                  ? `Erinnerung ${leads.map((l) => (l === 0 ? "am Tag selbst" : l === 1 ? "1 Tag vorher" : `${l} Tage vorher`)).join(" und ")}, Frist am ${fmtDate(d.due_date)}.`
                  : "Ohne Vorlaufzeit gibt es keine Erinnerung."}
            </div>
            <label className="rv-check">
              <input type="checkbox" checked={d.accepted} onChange={(e) => patch(d.key, { accepted: e.target.checked })} />
              <span>Frist stimmt, bitte daran erinnern</span>
            </label>
          </div>
        );
      })}
    </div>
  );
}
