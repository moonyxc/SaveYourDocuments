import { useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "../../lib/api";
import { date, eur } from "../../lib/format";
import { Modal, useUi } from "../ui";
import { forgetDraft } from "./ReviewForm";
import { plural, type DocDetail } from "./types";

type Settings = { batch_confirm_enabled: boolean; batch_confirm_threshold: number };

const MAX_CHECKED = 60;

/** Gleiche Regel wie im Backend: nur eindeutige Dokumente ohne offene Fristen und neue Firmen. */
export function isSafe(d: DocDetail, threshold: number): boolean {
  if (d.state !== "erkannt" || d.archived) return false;
  if (d.job && (d.job.state === "wartend" || d.job.state === "laeuft" || d.job.state === "fehler")) return false;
  if (d.company_id === null || d.doc_date === null) return false;
  const conf = (f: string) => d.extractions.find((e) => e.field === f)?.confidence ?? 0;
  if (conf("firma") < threshold || conf("datum") < threshold) return false;
  if (d.amount_cents !== null && conf("betrag") < threshold) return false;
  return !d.deadlines.some((x) => !x.confirmed);
}

export function useReviewSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/api/settings") });
}

export function BatchConfirm({ ids, threshold, enabled }: { ids: number[]; threshold: number; enabled: boolean }) {
  const qc = useQueryClient();
  const { toast } = useUi();
  const [open, setOpen] = useState(false);
  const checked = ids.slice(0, MAX_CHECKED);
  const results = useQueries({
    queries: checked.map((id) => ({
      queryKey: ["document", id],
      queryFn: () => api.get<DocDetail>(`/api/documents/${id}`),
      enabled,
    })),
  });
  const safe = results.map((r) => r.data).filter((d): d is DocDetail => !!d && isSafe(d, threshold));
  const loading = results.some((r) => r.isLoading);

  const run = useMutation({
    mutationFn: () => api.post<{ confirmed: number[]; skipped: number[] }>("/api/documents/confirm-batch", { ids: safe.map((d) => d.id) }),
    onSuccess: (r) => {
      r.confirmed.forEach(forgetDraft);
      setOpen(false);
      toast(
        r.skipped.length
          ? `${r.confirmed.length} ${plural(r.confirmed.length, "Dokument", "Dokumente")} bestätigt, ${r.skipped.length} ${plural(r.skipped.length, "bleibt", "bleiben")} zur Prüfung.`
          : `${r.confirmed.length} ${plural(r.confirmed.length, "Dokument", "Dokumente")} bestätigt.`,
      );
      void qc.invalidateQueries();
    },
    onError: (e) => toast(errorText(e), "bad"),
  });

  if (!enabled) return null;
  if (safe.length === 0) {
    return loading ? null : (
      <p className="muted rv-small" style={{ margin: 0 }}>
        Sammelbestätigung: Zurzeit ist kein Dokument sicher genug. Prüfe sie einzeln.
      </p>
    );
  }
  return (
    <>
      <button className="btn secondary" type="button" onClick={() => setOpen(true)}>
        Alle sicheren bestätigen ({safe.length})
      </button>
      {open ? (
        <Modal
          title="Sichere Dokumente bestätigen"
          wide
          onClose={() => setOpen(false)}
          actions={
            <>
              <button className="btn ghost" type="button" onClick={() => setOpen(false)}>
                Abbrechen
              </button>
              <button className="btn primary" type="button" disabled={run.isPending} onClick={() => run.mutate()}>
                {run.isPending ? "Wird bestätigt …" : `${safe.length} ${plural(safe.length, "Dokument", "Dokumente")} bestätigen`}
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            Bei diesen Dokumenten sind Firma, Datum und Betrag mit mindestens {Math.round(threshold * 100)} % Sicherheit erkannt. Es gibt keine offenen
            Fristen. Dokumente mit neuer Firma oder Fristen prüfst du weiter einzeln.
          </p>
          <ul className="list" style={{ maxHeight: "18rem", overflow: "auto" }}>
            {safe.map((d) => (
              <li className="item" key={d.id}>
                <div className="grow">
                  <strong>{d.company_name}</strong> · {d.doc_type ?? "Dokument"}
                </div>
                <span className="muted">
                  {date(d.doc_date)} · {eur(d.amount_cents)}
                </span>
              </li>
            ))}
          </ul>
        </Modal>
      ) : null}
    </>
  );
}
