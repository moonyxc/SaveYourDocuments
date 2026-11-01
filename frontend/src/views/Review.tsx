import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { date, eur } from "../lib/format";
import { useNav } from "../lib/nav";
import { Badge, Empty, ErrorBox, PageHead, Spinner } from "../components/ui";
import { BatchConfirm, useReviewSettings } from "../components/review/BatchConfirm";
import { DocumentViewer } from "../components/review/DocumentViewer";
import { forgetDraft, ReviewForm } from "../components/review/ReviewForm";
import { JOB_ERRORS, plural, type DocDetail, type QueueItem } from "../components/review/types";
import "../components/review/review.css";

export default function Review() {
  const { params, go } = useNav();
  const settings = useReviewSettings();
  const queue = useQuery({
    queryKey: ["review-queue"],
    queryFn: () => api.get<{ items: QueueItem[] }>("/api/documents?state=erkannt&archived=nein&sort=import_ab&limit=200"),
  });
  const items = [...(queue.data?.items ?? [])].reverse();
  const current = params.doc ?? items[0]?.id;
  const index = items.findIndex((i) => i.id === current);

  const detail = useQuery({
    queryKey: ["document", current],
    queryFn: () => api.get<DocDetail>(`/api/documents/${current}`),
    enabled: current !== undefined,
    refetchInterval: (q) => (q.state.data?.job && ["wartend", "laeuft"].includes(q.state.data.job.state) ? 2000 : false),
  });

  useEffect(() => {
    if (params.doc === undefined && current !== undefined) go("review", { doc: current });
  }, [params.doc, current, go]);

  const open = (id: number) => go("review", { doc: id });
  const next = () => {
    const n = items[index + 1] ?? items.find((i) => i.id !== current);
    if (n) open(n.id);
    else go("start");
  };

  if (queue.isLoading || settings.isLoading) return <Spinner />;
  if (queue.error) return <ErrorBox error={queue.error} />;

  if (items.length === 0 && params.doc === undefined) {
    return (
      <>
        <PageHead title="Dokument prüfen" />
        <Empty
          title="Alles geprüft"
          action={
            <button className="btn primary" onClick={() => go("import")}>
              Neue Dokumente importieren
            </button>
          }
        >
          Es wartet kein Dokument auf deine Bestätigung.
        </Empty>
      </>
    );
  }

  const threshold = settings.data?.batch_confirm_threshold ?? 0.9;
  const d = detail.data;
  const jobState = d?.job?.state;

  return (
    <>
      <div className="rv-head">
        <PageHead
          title="Dokument prüfen"
          lead={`${items.length} ${plural(items.length, "Dokument wartet", "Dokumente warten")} auf deine Bestätigung.`}
        />
        <div className="rv-nav">
          <BatchConfirm ids={items.map((i) => i.id)} threshold={threshold} enabled={settings.data?.batch_confirm_enabled ?? false} />
          <button className="btn secondary" disabled={index <= 0} onClick={() => open(items[index - 1].id)}>
            ← Zurück
          </button>
          <button className="btn secondary" disabled={index < 0 || index >= items.length - 1} onClick={() => open(items[index + 1].id)}>
            Weiter →
          </button>
        </div>
      </div>

      <details className="card rv-queue">
        <summary>{items.length === 1 ? "Das Dokument" : `Alle ${items.length} Dokumente`} in der Warteschlange</summary>
        {items.map((i) => (
          <button key={i.id} className="rv-queue-item" aria-current={i.id === current} onClick={() => open(i.id)}>
            <span className="grow">{i.company_name ?? i.original_name}</span>
            <span>{i.doc_type ?? "Dokument"}</span>
            <span className="muted">
              {date(i.doc_date)} · {eur(i.amount_cents)}
            </span>
          </button>
        ))}
      </details>

      {detail.isLoading ? <Spinner /> : null}
      {detail.error ? <ErrorBox error={detail.error} /> : null}
      {d ? (
        <div className="grid-gap g2">
          <div className="rv-left">
            <DocumentViewer key={d.id} docId={d.id} parts={d.parts} />
          </div>
          <div>
            {jobState === "wartend" || jobState === "laeuft" ? (
              <div className="notice" role="status">
                <Badge tone="blue">Wird erkannt</Badge> Die Angaben erscheinen in wenigen Sekunden. Du kannst sie auch jetzt schon von Hand eintragen.
              </div>
            ) : null}
            {jobState === "fehler" ? (
              <div className="notice warn" role="alert">
                {JOB_ERRORS[d.job?.error_code ?? ""] ?? JOB_ERRORS.interner_fehler}
              </div>
            ) : null}
            <ReviewForm
              key={d.id}
              detail={d}
              threshold={threshold}
              hasNext={items.length > 1}
              onConfirmed={() => {
                forgetDraft(d.id);
                next();
              }}
              onArchived={() => {
                forgetDraft(d.id);
                next();
              }}
              onOpenDoc={open}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
