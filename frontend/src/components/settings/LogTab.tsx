import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, mediaUrl, type Json } from "../../lib/api";
import { Empty, ErrorBox, Spinner, useUi } from "../ui";
import { bytes, date } from "../../lib/format";
import { copyText, download, localTime, Section } from "./shared";

const EVENTS: Record<string, string> = {
  "backup.created": "Sicherung angelegt",
  "batch.committed": "Stapel übernommen",
  "batch.received": "Stapel empfangen",
  "company.created": "Firma angelegt",
  "company.merged": "Firmen zusammengeführt",
  "deadline.changed": "Frist geändert",
  "deadline.created": "Frist angelegt",
  "deadline.removed": "Frist entfernt",
  "deadline.saved": "Frist gespeichert",
  "deadline.completed": "Frist erledigt",
  "deadline.reopened": "Frist wieder geöffnet",
  "device.trusted": "Gerät als bekannt gespeichert",
  "device.untrusted": "Gerät entfernt",
  "document.archived": "Dokument archiviert",
  "document.restored": "Dokument wiederhergestellt",
  "document.confirmed": "Dokument bestätigt",
  "document.corrected": "Dokument korrigiert",
  "document.exported": "Dokument exportiert",
  "document.imported": "Dokument importiert",
  "document.paid_changed": "Bezahlt-Status geändert",
  "document.recognised": "Dokument erkannt",
  "document.state_changed": "Status geändert",
  "document.tags_changed": "Stichwörter geändert",
  "export.done": "Export abgeschlossen",
  "integrity.checked": "Archiv geprüft",
  "link.confirmed": "Verknüpfung bestätigt",
  "link.rejected": "Verknüpfung abgelehnt",
  "security.key_changed": "Schlüssel gewechselt",
  "security.password_changed": "Passwort geändert",
  "settings.changed": "Einstellungen geändert",
  "setup.completed": "Einrichtung abgeschlossen",
};

const MAX_ROWS = 1000;

function clock(ts: string): string {
  const t = localTime(ts, true);
  return t.includes(",") ? t.split(",")[1].trim() : t;
}

function AuditCard() {
  const days = useQuery({ queryKey: ["audit", "days"], queryFn: () => api.get<Json>("/api/audit/days") });
  const [picked, setPicked] = useState<string | null>(null);
  const list: string[] = days.data?.items ?? [];
  const day = picked && list.includes(picked) ? picked : (list[0] ?? null);
  const rows = useQuery({
    queryKey: ["audit", "day", day],
    queryFn: () => api.get<Json>(`/api/audit/${day}`),
    enabled: day !== null,
  });
  const items: Json[] = rows.data?.items ?? [];

  return (
    <Section
      id="st-audit"
      title="Aktivitätsprotokoll"
      intro="Hier steht, was im Programm passiert ist: Empfang, Import, Korrekturen, Sicherungen. Es enthält nur Ereignisse und Nummern, keine Inhalte wie Firmennamen oder Beträge. Die Tage zählen nach Weltzeit, die Uhrzeiten zeigen deine Ortszeit."
    >
      {days.isPending ? (
        <Spinner />
      ) : days.isError ? (
        <ErrorBox error={days.error} retry={() => void days.refetch()} />
      ) : list.length === 0 ? (
        <Empty title="Noch keine Einträge">Sobald etwas passiert, erscheint es hier.</Empty>
      ) : (
        <>
          <div className="st-days" role="group" aria-label="Tag wählen">
            {list.map((d) => (
              <button key={d} aria-pressed={d === day} onClick={() => setPicked(d)}>
                {date(d)}
              </button>
            ))}
          </div>
          {rows.isPending ? (
            <Spinner />
          ) : rows.isError ? (
            <ErrorBox error={rows.error} retry={() => void rows.refetch()} />
          ) : (
            <>
              <div className="row wrap spread" style={{ marginBottom: ".75rem" }}>
                <span className="muted" data-testid="audit-count">
                  {items.length} {items.length === 1 ? "Eintrag" : "Einträge"} am {date(day)}
                </span>
                <a className="btn secondary small" href={mediaUrl(`/api/audit/${day}/export.csv`)} download>
                  Tag als CSV speichern
                </a>
              </div>
              <div className="card flush st-scroll">
                <table className="tbl" aria-label={`Protokoll vom ${date(day)}`}>
                  <thead>
                    <tr>
                      <th>Zeit</th>
                      <th>Ereignis</th>
                      <th className="num">Dokument</th>
                      <th className="num">Stapel</th>
                      <th className="num">Gerät</th>
                      <th>Feld</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.slice(0, MAX_ROWS).map((r, i) => (
                      <tr key={i}>
                        <td className="mono">{clock(r.ts)}</td>
                        <td>{EVENTS[r.event] ?? <span className="mono">{r.event}</span>}</td>
                        <td className="num">{r.document_id ?? "–"}</td>
                        <td className="num">{r.batch_id ?? "–"}</td>
                        <td className="num">{r.device_id ?? "–"}</td>
                        <td className="mono">{r.field ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {items.length > MAX_ROWS ? (
                <p className="hint">Gezeigt werden die ersten {MAX_ROWS} Einträge. Alle findest du in der CSV-Datei.</p>
              ) : null}
            </>
          )}
        </>
      )}
    </Section>
  );
}

function LogsCard() {
  const { toast } = useUi();
  const files = useQuery({ queryKey: ["logs"], queryFn: () => api.get<Json>("/api/logs") });
  const [picked, setPicked] = useState<string | null>(null);
  const list: Json[] = files.data?.items ?? [];
  const name = picked && list.some((f) => f.name === picked) ? picked : (list[0]?.name ?? null);
  const text = useQuery({
    queryKey: ["logs", "file", name],
    queryFn: () => api.get<string>(`/api/logs/${name}`),
    enabled: name !== null,
  });

  return (
    <Section
      id="st-logs"
      title="Technisches Protokoll für den Support"
      intro="Wenn etwas nicht funktioniert, hilft dieses Protokoll bei der Fehlersuche. Es enthält nur Ereignisnamen, Nummern und Fehlercodes, keine Dokumentinhalte und keine persönlichen Daten. Du kannst es bedenkenlos weitergeben."
    >
      {files.isPending ? (
        <Spinner />
      ) : files.isError ? (
        <ErrorBox error={files.error} retry={() => void files.refetch()} />
      ) : list.length === 0 ? (
        <Empty title="Noch keine Protokolldatei">Sie entsteht, sobald das Programm etwas zu melden hat.</Empty>
      ) : (
        <>
          <div className="st-days" role="group" aria-label="Protokolldatei wählen">
            {list.map((f) => (
              <button key={f.name} aria-pressed={f.name === name} onClick={() => setPicked(f.name)}>
                {f.name === "diagnose.log" ? "Heute" : date(f.name.replace("diagnose.log.", ""))}
                <span className="muted"> · {bytes(f.size)}</span>
              </button>
            ))}
          </div>
          {text.isPending ? (
            <Spinner />
          ) : text.isError ? (
            <ErrorBox error={text.error} retry={() => void text.refetch()} />
          ) : (
            <>
              <pre className="st-log" tabIndex={0} aria-label="Inhalt des technischen Protokolls" data-testid="log-text">
                {text.data || "Die Datei ist leer."}
              </pre>
              <div className="actions" style={{ marginTop: ".75rem" }}>
                <button
                  className="btn secondary small"
                  onClick={async () =>
                    toast(
                      (await copyText(text.data ?? ""))
                        ? "Protokoll kopiert"
                        : "Kopieren ging nicht. Nutze stattdessen „Herunterladen“.",
                    )
                  }
                >
                  Kopieren
                </button>
                <button className="btn secondary small" onClick={() => download(`${name}.txt`, text.data ?? "")}>
                  Herunterladen
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Section>
  );
}

export function LogTab() {
  return (
    <>
      <AuditCard />
      <LogsCard />
    </>
  );
}
