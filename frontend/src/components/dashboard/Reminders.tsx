import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorText, type Json } from "../../lib/api";
import { date, eur, relativeDays } from "../../lib/format";
import { useNav } from "../../lib/nav";
import { Badge, useUi } from "../ui";
import { SnoozeModal, TYPE_TONE, typeLabel } from "../deadlines/common";

/** Faellige Erinnerungen mit Aktionen. */
export function Reminders({ items }: { items: Json[] }) {
  const { toast } = useUi();
  const { go } = useNav();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<number | null>(null);
  const [snoozing, setSnoozing] = useState<number | null>(null);

  const run = async (rid: number, fn: () => Promise<unknown>, ok: string) => {
    setBusy(rid);
    try {
      await fn();
      toast(ok);
      void qc.invalidateQueries();
    } catch (e) {
      toast(errorText(e), "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card" aria-labelledby="rem-title">
      <div className="row spread wrap">
        <h2 id="rem-title">Erinnerungen</h2>
        <button className="btn ghost small" onClick={() => go("fristen")}>
          Alle Fristen
        </button>
      </div>
      <ul className="list">
        {items.map((r) => {
          const rid = r.reminder_id as number;
          const late = r.overdue as boolean;
          const rel = relativeDays(r.due_date);
          return (
            <li key={rid} className="item" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
              <div className="grow" style={{ minWidth: "14rem" }}>
                <div className="row wrap" style={{ gap: ".5rem" }}>
                  <strong>{r.company_name || r.original_name}</strong>
                  <Badge tone={TYPE_TONE[r.type] ?? "gray"}>{typeLabel(r.type)}</Badge>
                  {r.type === "zahlungsziel" && r.paid ? <Badge tone="green">✓ Bezahlt</Badge> : null}
                </div>
                <div className={late ? "err" : "muted"} style={{ fontWeight: late ? 600 : 400 }}>
                  {late ? "▲ Überfällig seit " : "Fällig am "}
                  {late ? `${-r.days_left} ${-r.days_left === 1 ? "Tag" : "Tagen"} (${date(r.due_date)})` : `${date(r.due_date)} · ${rel}`}
                </div>
              </div>
              {r.amount_cents != null ? (
                <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  {eur(r.amount_cents)}
                </span>
              ) : null}
              <div className="row wrap" style={{ gap: ".5rem", flexBasis: "100%" }}>
                <button
                  className="btn primary small"
                  disabled={busy === rid}
                  title="Blendet die Erinnerung aus. Die Frist bleibt unter „Fristen“ offen."
                  onClick={() =>
                    void run(rid, () => api.post(`/api/reminders/${rid}/dismiss`), "Die Erinnerung ist ausgeblendet. Die Frist bleibt unter „Fristen“ offen.")
                  }
                >
                  Erledigt
                </button>
                <button className="btn secondary small" disabled={busy === rid} onClick={() => setSnoozing(rid)}>
                  Später erinnern
                </button>
                {r.type === "zahlungsziel" && !r.paid ? (
                  <button
                    className="btn secondary small"
                    disabled={busy === rid}
                    onClick={() =>
                      void run(rid, () => api.post(`/api/documents/${r.document_id}/paid`, { paid: true }), "Das Dokument ist als bezahlt markiert.")
                    }
                  >
                    Als bezahlt markieren
                  </button>
                ) : null}
                <button className="btn ghost small" onClick={() => go("docs", { doc: r.document_id })}>
                  Dokument öffnen
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {snoozing !== null ? <SnoozeModal reminderId={snoozing} onClose={() => setSnoozing(null)} /> : null}
    </section>
  );
}
