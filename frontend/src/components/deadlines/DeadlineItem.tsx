import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "../../lib/api";
import { date, eur } from "../../lib/format";
import { useNav } from "../../lib/nav";
import { Badge, useUi } from "../ui";
import { type Deadline, TYPE_TONE, dueText, leadText, repeatText, typeLabel } from "./common";

type Props = {
  d: Deadline;
  onEdit: (d: Deadline) => void;
  onSnooze: (reminderId: number) => void;
};

/** Eine Frist als Karte der Zeitleiste. */
export function DeadlineItem({ d, onEdit, onSnooze }: Props) {
  const { toast } = useUi();
  const { go } = useNav();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const refresh = () => void qc.invalidateQueries();

  const done = d.status === "erledigt";
  const expired = d.status === "abgelaufen";
  const when = dueText(d);
  const tone = done ? "done" : expired ? "" : d.overdue ? "late" : d.days_left <= 14 ? "soon" : "";

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      refresh();
    } catch (e) {
      toast(errorText(e), "bad");
    } finally {
      setBusy(false);
    }
  };

  const name = d.company_name || d.original_name || "Dokument";
  const docInfo = [d.doc_type, d.company_name ? d.original_name : null].filter(Boolean).join(" · ");

  return (
    <li className={`tl ${tone === "done" || expired ? "done" : tone}`}>
      <div className="card">
        <div className="dl-head">
          <Badge tone={TYPE_TONE[d.type] ?? "gray"}>{typeLabel(d.type)}</Badge>
          <strong style={{ color: "var(--text-primary)" }}>{date(d.due_date)}</strong>
          <span className={`dl-when ${tone}`}>
            <span aria-hidden="true">{when.symbol} </span>
            {when.text}
          </span>
          {d.repeat_months ? <Badge tone="gray">↻ {repeatText(d.repeat_months)}</Badge> : null}
          {d.type === "zahlungsziel" && d.paid ? <Badge tone="green">✓ Bezahlt</Badge> : null}
          {d.reminder_id ? <Badge tone="purple">● Erinnerung aktiv</Badge> : null}
        </div>
        <div className="row spread wrap" style={{ marginTop: ".5rem", alignItems: "baseline" }}>
          <div style={{ minWidth: 0 }}>
            <strong style={{ color: "var(--text-primary)" }}>{name}</strong>
            {docInfo ? <span className="muted"> · {docInfo}</span> : null}
          </div>
          {d.amount_cents != null ? <span className="mono" style={{ color: "var(--text-primary)" }}>{eur(d.amount_cents)}</span> : null}
        </div>
        {!done && !expired ? <div className="muted hint">{leadText(d.lead_days)}</div> : null}
        {d.note ? <div className="hint">Notiz: {d.note}</div> : null}
        <div className="dl-actions">
          {done || expired ? (
            <button
              className="btn secondary small"
              disabled={busy}
              onClick={() => void run(() => api.post(`/api/deadlines/${d.id}/complete`, { done: false }), "Die Frist ist wieder offen.")}
            >
              Wieder öffnen
            </button>
          ) : (
            <button
              className="btn primary small"
              disabled={busy}
              onClick={() => void run(() => api.post(`/api/deadlines/${d.id}/complete`, { done: true }), "Die Frist ist als erledigt markiert.")}
            >
              Als erledigt markieren
            </button>
          )}
          {d.type === "zahlungsziel" && !d.paid && !done && !expired ? (
            <button
              className="btn secondary small"
              disabled={busy}
              onClick={() => void run(() => api.post(`/api/documents/${d.document_id}/paid`, { paid: true }), "Das Dokument ist als bezahlt markiert.")}
            >
              Als bezahlt markieren
            </button>
          ) : null}
          {d.reminder_id ? (
            <>
              <button className="btn secondary small" disabled={busy} onClick={() => onSnooze(d.reminder_id!)}>
                Später erinnern
              </button>
              <button
                className="btn secondary small"
                disabled={busy}
                onClick={() => void run(() => api.post(`/api/reminders/${d.reminder_id}/dismiss`), "Die Erinnerung ist ausgeblendet. Die Frist bleibt offen.")}
              >
                Erinnerung ausblenden
              </button>
            </>
          ) : null}
          <button className="btn ghost small" onClick={() => onEdit(d)}>
            Bearbeiten
          </button>
          <button className="btn ghost small" onClick={() => go("docs", { doc: d.document_id })}>
            Dokument öffnen
          </button>
        </div>
      </div>
    </li>
  );
}
