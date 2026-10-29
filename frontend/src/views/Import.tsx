import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Json } from "../lib/api";
import { useEvent } from "../lib/events";
import { useNav } from "../lib/nav";
import { Empty, ErrorBox, PageHead, Spinner, useUi } from "../components/ui";
import { BatchSorter, type CommitResult, type PendingBatch } from "../components/import/BatchSorter";
import { IncomingRequests, ReceiverCard, type IncomingRequest, type ReceiverStatus } from "../components/import/Incoming";
import { UploadZone } from "../components/import/UploadZone";
import "../components/import/import.css";

type Summary = { key: number; label: string; result: CommitResult };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function SummaryCard({ s, onClose, onReview }: { s: Summary; onClose: () => void; onReview: () => void }) {
  const { created, duplicates, archived } = s.result;
  return (
    <section className="notice good" aria-label="Ergebnis der Übernahme" style={{ marginBottom: "1.5rem" }}>
      <div className="row spread wrap" style={{ alignItems: "flex-start" }}>
        <h2 style={{ margin: 0 }}>Übernommen: {s.label}</h2>
        <button className="btn ghost small" onClick={onClose}>
          Hinweis schließen
        </button>
      </div>
      <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
        {created.length > 0 ? (
          <li>
            ✓ {created.length} {plural(created.length, "Dokument wird", "Dokumente werden")} jetzt erkannt. Das dauert wenige Sekunden pro Dokument.
          </li>
        ) : null}
        {duplicates.length > 0 ? (
          <li>
            ▲ {duplicates.length} {plural(duplicates.length, "Datei war", "Dateien waren")} schon im Archiv und wurde nicht doppelt gespeichert.
          </li>
        ) : null}
        {archived.length > 0 ? (
          <li>
            {archived.length} {plural(archived.length, "Datei", "Dateien")} aussortiert. {plural(archived.length, "Sie liegt", "Sie liegen")} im Archiv
            unter Dokumente.
          </li>
        ) : null}
        {created.length === 0 && duplicates.length === 0 && archived.length === 0 ? <li>Es gab nichts zu übernehmen.</li> : null}
      </ul>
      <div className="row wrap" style={{ marginTop: "1rem" }}>
        {created.length > 0 ? (
          <button className="btn primary" onClick={onReview}>
            Jetzt prüfen
          </button>
        ) : null}
        <button className="btn secondary" onClick={onClose}>
          Weitere Fotos sortieren
        </button>
      </div>
    </section>
  );
}

function Processing({ counts, toReview, onReview }: { counts: Json; toReview: number; onReview: () => void }) {
  const open = (counts?.wartend ?? 0) + (counts?.laeuft ?? 0);
  if (open <= 0) return null;
  return (
    <section className="card" style={{ marginBottom: "1.5rem" }} aria-label="Erkennung läuft">
      <div className="row spread wrap">
        <div className="row" role="status">
          <span className="spinner" aria-hidden="true" />
          <strong style={{ color: "var(--text-primary)" }}>
            {open} {plural(open, "Dokument wird", "Dokumente werden")} erkannt …
          </strong>
        </div>
        {toReview > 0 ? (
          <button className="btn secondary" onClick={onReview}>
            Fertige Dokumente prüfen ({toReview})
          </button>
        ) : null}
      </div>
      <div className="imp-progress" aria-hidden="true">
        <div style={{ width: `${Math.max(8, Math.round(((counts?.laeuft ?? 0) / open) * 100))}%` }} />
      </div>
      <div className="hint">Du kannst weiterarbeiten. Fertige Dokumente erscheinen unter „Prüfen“.</div>
    </section>
  );
}

export default function Import() {
  const { go } = useNav();
  const { toast } = useUi();
  const [summaries, setSummaries] = useState<Summary[]>([]);

  const pending = useQuery({ queryKey: ["import", "pending"], queryFn: () => api.get<{ items: PendingBatch[] }>("/api/import/pending") });
  const incoming = useQuery({
    queryKey: ["incoming"],
    queryFn: () => api.get<{ items: IncomingRequest[]; status: ReceiverStatus }>("/api/incoming"),
  });
  const firewall = useQuery({
    queryKey: ["firewall"],
    queryFn: () => api.get<{ supported: boolean; rule: boolean | null; port: number }>("/api/firewall"),
  });
  const trusted = useQuery({
    queryKey: ["trusted-devices"],
    queryFn: () => api.get<{ items: { alias: string }[] }>("/api/trusted-devices"),
  });
  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api.get<Json>("/api/jobs"),
    refetchInterval: (q) => ((q.state.data?.counts?.wartend ?? 0) + (q.state.data?.counts?.laeuft ?? 0) > 0 ? 2500 : false),
  });
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Json>("/api/dashboard") });

  useEvent((e) => {
    if (e.type === "incoming.request") toast("Ein Gerät möchte Dateien senden. Bitte entscheide oben auf dieser Seite.");
    if (e.type === "import.received") toast("Neue Fotos sind angekommen. Sortiere sie unten.");
  });

  const trustedAliases = new Set((trusted.data?.items ?? []).map((d) => d.alias));
  const batches = pending.data?.items ?? [];
  const toReview: number = dash.data?.to_review ?? 0;

  return (
    <>
      <PageHead
        title="Fotos sortieren"
        lead="Fasse Fotos zusammen, die zu einem Dokument gehören, zum Beispiel die Seiten eines Briefs. Danach liest das Programm die Dokumente."
      />

      <IncomingRequests items={incoming.data?.items ?? []} />

      {summaries.map((s) => (
        <SummaryCard
          key={s.key}
          s={s}
          onClose={() => setSummaries((x) => x.filter((y) => y.key !== s.key))}
          onReview={() => go("review")}
        />
      ))}

      <Processing counts={jobs.data?.counts} toReview={toReview} onReview={() => go("review")} />

      <div className="stack" style={{ gap: "1.5rem" }}>
        <UploadZone />

        {pending.isPending ? <Spinner /> : null}
        {pending.isError ? <ErrorBox error={pending.error} retry={() => void pending.refetch()} /> : null}
        {pending.isSuccess && batches.length === 0 ? (
          <div className="card">
            <Empty title="Nichts zu sortieren">
              Ziehe Fotos oder PDFs oben hinein oder sende sie per LocalSend vom Handy. Sie erscheinen dann hier.
            </Empty>
          </div>
        ) : null}
        {batches.map((b) => (
          <BatchSorter
            key={b.id}
            batch={b}
            trusted={b.source === "localsend" && !!b.device_alias && trustedAliases.has(b.device_alias)}
            onDone={(result, label) => setSummaries((x) => [{ key: Date.now(), label, result }, ...x])}
          />
        ))}

        <ReceiverCard status={incoming.data?.status} firewall={firewall.data} onSettings={() => go("settings")} />
      </div>
    </>
  );
}
