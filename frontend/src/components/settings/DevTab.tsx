import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText, type Json } from "../../lib/api";
import { Badge, ErrorBox, Spinner, useUi } from "../ui";
import { Section, SecretModal, useSettings, useStatus } from "./shared";

const TABLES: Record<string, string> = {
  document: "Dokumente",
  blob_store: "Gespeicherte Dateien",
  deadline: "Fristen",
  reminder: "Erinnerungen",
  extraction: "Erkennungsergebnisse",
  job: "Aufgaben",
  audit_log: "Protokolleinträge",
  company: "Firmen",
  tag: "Stichwörter",
  import_file: "Importdateien",
};
const JOBS: Record<string, string> = { wartend: "Wartend", laeuft: "Läuft", fertig: "Fertig", fehler: "Fehlgeschlagen" };

function Info() {
  const qc = useQueryClient();
  const { toast } = useUi();
  const info = useQuery({ queryKey: ["dev", "info"], queryFn: () => api.get<Json>("/api/dev/info") });
  const redo = useMutation({
    mutationFn: () => api.post<Json>("/api/dev/reprocess-failed"),
    onSuccess: (r) => {
      toast(
        r.queued
          ? `${r.queued} ${r.queued === 1 ? "Dokument wird" : "Dokumente werden"} noch einmal erkannt`
          : "Es gibt keine fehlgeschlagenen Erkennungen",
      );
      void qc.invalidateQueries({ queryKey: ["dev"] });
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  if (info.isPending) return <Spinner />;
  if (info.isError) return <ErrorBox error={info.error} retry={() => void info.refetch()} />;
  const d = info.data;
  const failed: Json[] = d.failed_jobs ?? [];
  return (
    <Section id="st-devinfo" title="Technische Übersicht">
      <dl className="st-kv" data-testid="dev-info">
        <dt>Programmversion</dt>
        <dd className="mono">{d.version}</dd>
        <dt>Archivversion</dt>
        <dd className="mono">{d.schema_version}</dd>
        <dt>Datenordner</dt>
        <dd className="mono">{d.data_dir}</dd>
        <dt>Archivdatei</dt>
        <dd className="mono">{d.vault_path}</dd>
        <dt>Texterkennung</dt>
        <dd>{d.ocr?.available ? "bereit" : "nicht verfügbar"}</dd>
        <dt>Empfang vom Handy</dt>
        <dd>
          {d.localsend?.running ? `läuft auf Anschluss ${d.localsend.port}` : d.localsend?.enabled ? "blockiert" : "aus"}
        </dd>
      </dl>

      <h3>Anzahl der Einträge</h3>
      <div className="card flush" style={{ marginBottom: "1rem" }}>
        <table className="tbl" aria-label="Einträge je Bereich">
          <tbody>
            {Object.entries(d.tables ?? {}).map(([k, n]) => (
              <tr key={k}>
                <td>{TABLES[k] ?? k}</td>
                <td className="num">{String(n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Aufgaben der Erkennung</h3>
      <div className="row wrap" style={{ marginBottom: "1rem" }}>
        {Object.entries(d.jobs ?? {}).map(([k, n]) => (
          <Badge key={k} tone={k === "fehler" && Number(n) > 0 ? "red" : "gray"}>
            {JOBS[k] ?? k}: {String(n)}
          </Badge>
        ))}
      </div>

      {failed.length ? (
        <>
          <h3>Fehlgeschlagene Aufgaben</h3>
          <div className="card flush st-scroll" style={{ marginBottom: "1rem" }}>
            <table className="tbl" aria-label="Fehlgeschlagene Aufgaben">
              <thead>
                <tr>
                  <th className="num">Dokument</th>
                  <th>Fehlercode</th>
                  <th className="num">Versuche</th>
                </tr>
              </thead>
              <tbody>
                {failed.map((j) => (
                  <tr key={j.id}>
                    <td className="num">{j.document_id}</td>
                    <td className="mono">{j.error_code ?? "–"}</td>
                    <td className="num">{j.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="muted">Es ist keine Erkennung fehlgeschlagen.</p>
      )}
      <div className="actions">
        <button
          className="btn secondary"
          onClick={() => redo.mutate()}
          disabled={redo.isPending || failed.length === 0}
          title={failed.length === 0 ? "Es gibt nichts neu zu erkennen" : undefined}
        >
          Fehlgeschlagene neu erkennen
        </button>
      </div>
    </Section>
  );
}

export function DevTab() {
  const qc = useQueryClient();
  const { toast } = useUi();
  const settings = useSettings();
  const status = useStatus();
  const [asking, setAsking] = useState(false);
  const off = useMutation({
    mutationFn: () => api.post("/api/dev/disable"),
    onSuccess: () => {
      toast("Entwicklermodus ist aus");
      void qc.invalidateQueries();
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  if (settings.isPending || status.isPending) return <Spinner />;
  if (settings.isError) return <ErrorBox error={settings.error} retry={() => void settings.refetch()} />;
  const on: boolean = settings.data.developer_mode;
  return (
    <>
      <Section
        id="st-dev"
        title="Entwicklermodus"
        intro="Für die Fehlersuche, zum Beispiel wenn der Support danach fragt. Normalerweise brauchst du ihn nicht."
      >
        <p>{on ? <Badge tone="yellow">! An</Badge> : <Badge tone="gray">Aus</Badge>}</p>
        <div className="notice" style={{ marginBottom: "1rem" }}>
          Der Entwicklermodus zeigt technische Angaben über dein Archiv und kann Verarbeitungen noch einmal anstoßen.
          Er verändert keine Dokumente, ist aber nicht für den Alltag gedacht. Schalte ihn danach wieder aus. Zum
          Einschalten musst du deinen Schlüssel oder dein Passwort noch einmal eingeben.
        </div>
        <div className="actions">
          {on ? (
            <button className="btn secondary" onClick={() => off.mutate()} disabled={off.isPending}>
              Entwicklermodus ausschalten
            </button>
          ) : (
            <button className="btn secondary" onClick={() => setAsking(true)}>
              Entwicklermodus einschalten
            </button>
          )}
        </div>
      </Section>

      {on ? <Info /> : null}

      {asking ? (
        <SecretModal
          mode={status.data?.mode}
          title="Entwicklermodus einschalten"
          intro={
            status.data?.mode === "password"
              ? "Gib zur Sicherheit dein Passwort ein."
              : "Gib zur Sicherheit deinen Wiederherstellungsschlüssel ein."
          }
          confirmLabel="Einschalten"
          onClose={() => setAsking(false)}
          onSubmit={async (secret) => {
            try {
              await api.post("/api/dev/enable", { secret });
            } catch (e) {
              return errorText(e);
            }
            setAsking(false);
            toast("Entwicklermodus ist an");
            void qc.invalidateQueries();
          }}
        />
      ) : null}
    </>
  );
}
