import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, errorText, type Json } from "../../lib/api";
import { Field, Modal, type Tone, useUi } from "../ui";
import "./deadlines.css";

export const DEADLINE_TYPES = ["zahlungsziel", "vertragsende", "kuendigungsfrist", "sonstige"] as const;
export type DeadlineType = (typeof DEADLINE_TYPES)[number];

export const TYPE_LABEL: Record<string, string> = {
  zahlungsziel: "Zahlung",
  vertragsende: "Vertragsende",
  kuendigungsfrist: "Kündigungsfrist",
  sonstige: "Sonstige Frist",
};
export const TYPE_TONE: Record<string, Tone> = {
  zahlungsziel: "blue",
  vertragsende: "purple",
  kuendigungsfrist: "yellow",
  sonstige: "gray",
};
export const typeLabel = (t: string): string => TYPE_LABEL[t] ?? "Frist";

export type Deadline = {
  id: number;
  document_id: number;
  type: string;
  due_date: string;
  status: "offen" | "erledigt" | "abgelaufen";
  repeat_months: number;
  lead_days: number[];
  note: string | null;
  days_left: number;
  overdue: boolean;
  company_name?: string | null;
  doc_type?: string | null;
  amount_cents?: number | null;
  original_name?: string;
  paid?: boolean;
  reminder_id?: number;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Text, der den Zustand einer Frist ohne Farbe erklaert. */
export function dueText(d: Pick<Deadline, "status" | "days_left" | "overdue">): { symbol: string; text: string } {
  if (d.status === "erledigt") return { symbol: "✓", text: "Erledigt" };
  if (d.status === "abgelaufen") return { symbol: "–", text: "Abgelaufen" };
  const n = d.days_left;
  if (d.overdue) return { symbol: "▲", text: `Überfällig seit ${plural(-n, "Tag", "Tagen")}` };
  if (n === 0) return { symbol: "●", text: "Heute fällig" };
  if (n === 1) return { symbol: "●", text: "Morgen fällig" };
  return { symbol: n <= 14 ? "●" : "○", text: `In ${n} Tagen fällig` };
}

export function repeatText(months: number): string {
  if (!months) return "";
  if (months === 1) return "monatlich";
  if (months === 3) return "vierteljährlich";
  if (months === 6) return "halbjährlich";
  if (months === 12) return "jährlich";
  if (months % 12 === 0) return `alle ${months / 12} Jahre`;
  return `alle ${months} Monate`;
}

export const REPEAT_CHOICES = [0, 1, 3, 6, 12, 24];

export function leadText(leads: number[]): string {
  if (!leads.length) return "Keine Erinnerung";
  const parts = [...leads].sort((a, b) => b - a).map((n) => (n === 0 ? "am Tag selbst" : `${plural(n, "Tag", "Tage")} vorher`));
  return `Erinnerung: ${parts.join(", ")}`;
}

/** "7, 1" -> [7, 1]; ungueltig -> null */
export function parseLeads(text: string): number[] | null {
  const parts = text
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => Number.isNaN(n) || n > 365)) return null;
  return [...new Set(nums)].sort((a, b) => b - a);
}

export const SNOOZE_CHOICES = [
  { days: 1, label: "Morgen" },
  { days: 3, label: "In 3 Tagen" },
  { days: 7, label: "In einer Woche" },
  { days: 14, label: "In 2 Wochen" },
  { days: 30, label: "In einem Monat" },
];

/** Dialog: Erinnerung fuer eine Anzahl Tage zurueckstellen. */
export function SnoozeModal({ reminderId, onClose }: { reminderId: number; onClose: () => void }) {
  const { toast } = useUi();
  const [days, setDays] = useState(1);
  const snooze = useMutation({
    mutationFn: () => api.post(`/api/reminders/${reminderId}/snooze`, { days }),
    onSuccess: () => {
      toast(`Du wirst ${days === 1 ? "morgen" : `in ${days} Tagen`} erneut erinnert.`);
      onClose();
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  return (
    <Modal
      title="Später erinnern"
      onClose={onClose}
      actions={
        <>
          <button className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={snooze.isPending} onClick={() => snooze.mutate()}>
            Später erinnern
          </button>
        </>
      }
    >
      <Field label="Wann soll die Erinnerung wiederkommen?" htmlFor="snooze-days">
        <select id="snooze-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {SNOOZE_CHOICES.map((c) => (
            <option key={c.days} value={c.days}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
    </Modal>
  );
}

/** Dialog: Frist bearbeiten. */
export function EditDeadlineModal({ deadline, onClose }: { deadline: Deadline; onClose: () => void }) {
  const { toast, confirm } = useUi();
  const [type, setType] = useState(deadline.type);
  const [due, setDue] = useState(deadline.due_date);
  const [repeat, setRepeat] = useState(deadline.repeat_months);
  const [leads, setLeads] = useState(deadline.lead_days.join(", "));
  const [note, setNote] = useState(deadline.note ?? "");
  const [problem, setProblem] = useState("");

  const choices = REPEAT_CHOICES.includes(repeat) ? REPEAT_CHOICES : [...REPEAT_CHOICES, repeat].sort((a, b) => a - b);

  const save = useMutation({
    mutationFn: (body: Json) => api.patch(`/api/deadlines/${deadline.id}`, body),
    onSuccess: () => {
      toast("Die Frist ist gespeichert.");
      onClose();
    },
    onError: (e) => setProblem(errorText(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/api/deadlines/${deadline.id}`),
    onSuccess: () => {
      toast("Die Frist ist entfernt.");
      onClose();
    },
    onError: (e) => setProblem(errorText(e)),
  });

  const submit = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
      setProblem("Bitte ein gültiges Datum eintragen.");
      return;
    }
    const parsed = parseLeads(leads);
    if (parsed === null) {
      setProblem("Der Vorlauf besteht aus ganzen Tagen zwischen 0 und 365, zum Beispiel „7, 1“.");
      return;
    }
    setProblem("");
    save.mutate({ type, due_date: due, repeat_months: repeat, lead_days: parsed, note: note.trim() || null });
  };

  const askRemove = async () => {
    const ok = await confirm({
      title: "Frist entfernen?",
      text: "Die Frist und ihre Erinnerungen werden gelöscht. Das Dokument bleibt im Archiv.",
      confirmLabel: "Entfernen",
      danger: true,
    });
    if (ok) remove.mutate();
  };

  return (
    <Modal
      title="Frist bearbeiten"
      onClose={onClose}
      actions={
        <>
          <button className="btn danger" style={{ marginRight: "auto" }} onClick={() => void askRemove()}>
            Frist entfernen
          </button>
          <button className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={save.isPending} onClick={submit}>
            Speichern
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        {deadline.company_name ?? deadline.original_name}
      </p>
      <Field label="Art der Frist" htmlFor="dl-type">
        <select id="dl-type" value={type} onChange={(e) => setType(e.target.value)}>
          {DEADLINE_TYPES.map((t) => (
            <option key={t} value={t}>
              {typeLabel(t)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Datum" htmlFor="dl-due">
        <input id="dl-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <Field
        label="Wiederholung"
        htmlFor="dl-repeat"
        hint="Nach Ablauf entsteht die nächste Frist automatisch. Ein verknüpftes Kündigungsschreiben stoppt die Wiederholung."
      >
        <select id="dl-repeat" value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
          {choices.map((m) => (
            <option key={m} value={m}>
              {m === 0 ? "Keine Wiederholung" : repeatText(m)[0].toUpperCase() + repeatText(m).slice(1)}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Erinnern (Tage vorher)"
        htmlFor="dl-leads"
        hint="Mehrere Werte mit Komma trennen. Beispiel: 7, 1 erinnert eine Woche und einen Tag vorher."
      >
        <input id="dl-leads" inputMode="numeric" value={leads} onChange={(e) => setLeads(e.target.value)} />
      </Field>
      <Field label="Notiz (freiwillig)" htmlFor="dl-note">
        <textarea id="dl-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {problem ? (
        <div className="notice bad" role="alert">
          {problem}
        </div>
      ) : null}
    </Modal>
  );
}
