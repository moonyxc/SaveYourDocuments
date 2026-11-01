import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Json } from "../lib/api";
import { useNav } from "../lib/nav";
import { Empty, ErrorBox, PageHead, Spinner } from "../components/ui";
import { type Deadline, DEADLINE_TYPES, EditDeadlineModal, SnoozeModal, typeLabel } from "../components/deadlines/common";
import { DeadlineItem } from "../components/deadlines/DeadlineItem";
import { LeadDefaults } from "../components/deadlines/LeadDefaults";

type StatusFilter = "offen" | "ueberfaellig" | "erledigt" | "abgelaufen" | "alle";

const STATUS_CHIPS: { id: StatusFilter; label: string }[] = [
  { id: "offen", label: "Offen" },
  { id: "ueberfaellig", label: "Überfällig" },
  { id: "erledigt", label: "Erledigt" },
  { id: "abgelaufen", label: "Abgelaufen" },
  { id: "alle", label: "Alle" },
];

const RANGES = [
  { v: "", label: "Alle Zeiträume" },
  { v: "7", label: "Nächste 7 Tage" },
  { v: "30", label: "Nächste 30 Tage" },
  { v: "90", label: "Nächste 90 Tage" },
  { v: "365", label: "Nächstes Jahr" },
];

const matchStatus = (d: Deadline, s: StatusFilter): boolean =>
  s === "alle" ? true : s === "ueberfaellig" ? d.status === "offen" && d.overdue : d.status === s;

type Group = { id: string; title: string; items: Deadline[] };

function group(items: Deadline[]): Group[] {
  const open = items.filter((d) => d.status === "offen");
  const buckets: Group[] = [
    { id: "late", title: "Überfällig", items: open.filter((d) => d.overdue) },
    { id: "week", title: "In den nächsten 7 Tagen", items: open.filter((d) => !d.overdue && d.days_left <= 7) },
    { id: "month", title: "In den nächsten 30 Tagen", items: open.filter((d) => d.days_left > 7 && d.days_left <= 30) },
    { id: "later", title: "Später", items: open.filter((d) => d.days_left > 30) },
    { id: "done", title: "Erledigt", items: items.filter((d) => d.status === "erledigt").reverse() },
    { id: "expired", title: "Abgelaufen", items: items.filter((d) => d.status === "abgelaufen").reverse() },
  ];
  return buckets.filter((b) => b.items.length);
}

export default function Deadlines() {
  const { go } = useNav();
  const [status, setStatus] = useState<StatusFilter>("offen");
  const [type, setType] = useState("");
  const [range, setRange] = useState("");
  const [editing, setEditing] = useState<Deadline | null>(null);
  const [snoozing, setSnoozing] = useState<number | null>(null);

  // Ein leerer "status" liefert alle Zustaende; gefiltert wird hier, damit die Zaehler stimmen.
  const list = useQuery({ queryKey: ["deadlines", "alle"], queryFn: () => api.get<{ items: Deadline[] }>("/api/deadlines?status=") });
  const rem = useQuery({ queryKey: ["reminders"], queryFn: () => api.get<{ items: Json[] }>("/api/reminders") });
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Json>("/api/dashboard") });

  const items = useMemo<Deadline[]>(() => {
    const active = new Map<number, number>((rem.data?.items ?? []).map((r) => [r.id as number, r.reminder_id as number]));
    return (list.data?.items ?? []).map((d) => ({ ...d, reminder_id: d.status === "offen" ? active.get(d.id) : undefined }));
  }, [list.data, rem.data]);

  const counts = useMemo(() => {
    const c = {} as Record<StatusFilter, number>;
    for (const s of STATUS_CHIPS) c[s.id] = items.filter((d) => matchStatus(d, s.id)).length;
    return c;
  }, [items]);

  const shown = useMemo(
    () =>
      items.filter(
        (d) =>
          matchStatus(d, status) &&
          (!type || d.type === type) &&
          (!range || (d.days_left >= 0 && d.days_left <= Number(range))),
      ),
    [items, status, type, range],
  );
  const groups = useMemo(() => group(shown), [shown]);
  const toReview: number = dash.data?.to_review ?? 0;
  const filtered = status !== "offen" || type !== "" || range !== "";

  return (
    <div>
      <PageHead
        title="Fristen"
        lead="Zahlungen und Kündigungen in zeitlicher Reihenfolge. Erinnerungen erscheinen auf der Startseite und als Benachrichtigung."
      />

      {toReview > 0 ? (
        <div className="suggest" role="note">
          <strong>
            {toReview === 1 ? "1 Dokument wartet" : `${toReview} Dokumente warten`} auf deine Prüfung.
          </strong>
          <p>Fristen aus erkannten Dokumenten werden erst eingetragen und erinnert, wenn du sie beim Prüfen bestätigt hast.</p>
          <button className="btn primary small" onClick={() => go("review")}>
            Jetzt prüfen
          </button>
        </div>
      ) : null}

      <div className="filters">
        <div role="group" aria-label="Status filtern" className="chips">
          {STATUS_CHIPS.map((c) => (
            <button key={c.id} className="chip" aria-pressed={status === c.id} onClick={() => setStatus(c.id)}>
              {c.label} ({counts[c.id]})
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="f-type">Art</label>
          <select id="f-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Alle Arten</option>
            {DEADLINE_TYPES.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-range">Zeitraum</label>
          <select id="f-range" value={range} onChange={(e) => setRange(e.target.value)}>
            {RANGES.map((r) => (
              <option key={r.v} value={r.v}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        {filtered ? (
          <button
            className="btn ghost small"
            onClick={() => {
              setStatus("offen");
              setType("");
              setRange("");
            }}
          >
            Filter zurücksetzen
          </button>
        ) : null}
      </div>

      {list.isLoading ? <Spinner /> : null}
      {list.isError ? <ErrorBox error={list.error} retry={() => void list.refetch()} /> : null}

      {list.data && !groups.length ? (
        <div className="card">
          {items.length === 0 ? (
            <Empty
              title="Noch keine Fristen"
              action={
                <button className="btn primary" onClick={() => go("review")}>
                  Dokumente prüfen
                </button>
              }
            >
              Sobald du ein Dokument mit Zahlungsziel oder Kündigungsfrist prüfst und die Frist bestätigst, erscheint sie hier. Nur bestätigte
              Fristen lösen Erinnerungen aus.
            </Empty>
          ) : (
            <Empty title="Keine Fristen für diese Auswahl">
              {status === "offen" && !type && !range
                ? "Es ist nichts offen. Erledigte Fristen findest du unter „Erledigt“."
                : "Nimm einen Filter heraus, um mehr Fristen zu sehen."}
            </Empty>
          )}
        </div>
      ) : null}

      {groups.map((g) => (
        <section key={g.id} className="dl-group" aria-labelledby={`g-${g.id}`}>
          <h2 id={`g-${g.id}`}>
            {g.title}
            <span className="muted">{g.items.length === 1 ? "1 Frist" : `${g.items.length} Fristen`}</span>
          </h2>
          <ul className="timeline">
            {g.items.map((d) => (
              <DeadlineItem key={d.id} d={d} onEdit={setEditing} onSnooze={setSnoozing} />
            ))}
          </ul>
        </section>
      ))}

      <div style={{ marginTop: "1.5rem" }}>
        <LeadDefaults />
      </div>

      {editing ? <EditDeadlineModal key={editing.id} deadline={editing} onClose={() => setEditing(null)} /> : null}
      {snoozing !== null ? <SnoozeModal reminderId={snoozing} onClose={() => setSnoozing(null)} /> : null}
    </div>
  );
}
