import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorText, type Json } from "../../lib/api";
import { bytes } from "../../lib/format";
import { Badge, ErrorBox, Field, Spinner, useUi } from "../ui";
import { FormError, localTime, Section, useSystem } from "./shared";

function StorageCard({ sys }: { sys: Json }) {
  const st = sys.storage;
  const warnings: string[] = st.warnings ?? [];
  return (
    <Section id="st-store" title="Speicher" intro="Alle Dokumente liegen in einer einzigen verschlüsselten Datei auf diesem Computer.">
      <dl className="st-kv">
        <dt>Archivdatei</dt>
        <dd className="mono" data-testid="vault-path">
          {st.vault_path}
        </dd>
        <dt>Größe</dt>
        <dd>{bytes(st.vault_bytes)}</dd>
        <dt>Freier Platz</dt>
        <dd>{bytes(st.free_bytes)}</dd>
      </dl>
      {warnings.map((w) => (
        <div key={w} className="notice" role="status" style={{ marginBottom: ".75rem" }}>
          <strong style={{ color: "var(--text-primary)" }}>Hinweis: </strong>
          {w}
        </div>
      ))}
      <p className="hint" style={{ marginBottom: 0 }}>
        Das Archiv wächst nur, weil nichts gelöscht wird. Unter „Anzeige“ kannst du „Platz sparen“ einschalten.
      </p>
    </Section>
  );
}

function BackupCard({ sys }: { sys: Json }) {
  const qc = useQueryClient();
  const { toast } = useUi();
  const st = sys.storage;
  const [keep, setKeep] = useState<string>(String(sys.backup_keep));
  const [folder, setFolder] = useState<string>(st.backup_dir);
  const [error, setError] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["system"] });

  const run = useMutation({
    mutationFn: () => api.post<Json>("/api/system/backup"),
    onSuccess: () => {
      toast("Sicherung angelegt");
      void refresh();
    },
    onError: (e) => {
      toast(errorText(e), "bad");
      void refresh();
    },
  });
  const saveCfg = useMutation({
    mutationFn: (body: Json) => api.put("/api/system/backup-config", body),
    onSuccess: async () => {
      setError("");
      toast("Gespeichert");
      await refresh();
      const d = qc.getQueryData<Json>(["system"]);
      if (d) {
        setFolder(d.storage.backup_dir);
        setKeep(String(d.backup_keep));
      }
    },
    onError: (e) => setError(errorText(e)),
  });

  const keepNum = Number(keep);
  const dirty = keep !== String(sys.backup_keep) || folder !== st.backup_dir;
  const backups: Json[] = sys.backups ?? [];

  return (
    <Section
      id="st-backup"
      title="Sicherungen"
      intro="Das Programm legt einmal am Tag automatisch eine Sicherungskopie an, solange es läuft. Die ältesten Kopien werden ersetzt."
    >
      <dl className="st-kv">
        <dt>Letzte Sicherung</dt>
        <dd data-testid="last-backup">{sys.last_backup ? localTime(sys.last_backup) : "Noch keine Sicherung"}</dd>
        <dt>Sicherungsordner</dt>
        <dd className="mono">{st.backup_dir}</dd>
      </dl>
      {sys.backup_error ? (
        <div className="notice bad" role="alert" style={{ marginBottom: "1rem" }}>
          {sys.backup_error} Prüfe, ob der Sicherungsordner erreichbar ist und genug Platz frei ist, und sichere dann
          noch einmal.
        </div>
      ) : null}
      <div className="actions" style={{ marginBottom: "1rem" }}>
        <button className="btn primary" onClick={() => run.mutate()} disabled={run.isPending}>
          Jetzt sichern
        </button>
        {run.isPending ? <Spinner label="Sicherung läuft …" /> : null}
      </div>

      {backups.length ? (
        <div className="card flush" style={{ marginBottom: "1.25rem" }}>
          <table className="tbl" aria-label="Vorhandene Sicherungen">
            <thead>
              <tr>
                <th>Datei</th>
                <th>Erstellt</th>
                <th className="num">Größe</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.name}>
                  <td className="mono" style={{ overflowWrap: "anywhere" }}>
                    {b.name}
                  </td>
                  <td>{localTime(b.created)}</td>
                  <td className="num">{bytes(b.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Es gibt noch keine Sicherungskopie. Drücke „Jetzt sichern“.</p>
      )}

      <hr className="st-divider" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirty) return;
          const body: Json = { backup_keep: keepNum };
          if (folder !== st.backup_dir) body.backup_dir = folder.trim();
          saveCfg.mutate(body);
        }}
      >
        <Field
          label="Sicherungsordner"
          htmlFor="st-bdir"
          hint="Vollständiger Pfad, zum Beispiel D:\Sicherungen. Am besten ein anderes Laufwerk oder ein USB-Stick (NTFS oder exFAT), damit eine Sicherung auch einen defekten Datenträger übersteht."
        >
          <input
            id="st-bdir"
            value={folder}
            spellCheck={false}
            className="mono"
            onChange={(e) => {
              setFolder(e.target.value);
              setError("");
            }}
          />
        </Field>
        <Field label="Wie viele Sicherungen behalten?" htmlFor="st-keep" hint="Erlaubt sind 1 bis 60. Ältere Kopien werden automatisch entfernt.">
          <input
            id="st-keep"
            type="number"
            min={1}
            max={60}
            inputMode="numeric"
            value={keep}
            style={{ maxWidth: "8rem" }}
            onChange={(e) => {
              setKeep(e.target.value);
              setError("");
            }}
          />
        </Field>
        <FormError>{error}</FormError>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={!dirty || saveCfg.isPending || !keep.trim()}>
            Speichern
          </button>
          <button
            className="btn ghost"
            type="button"
            disabled={saveCfg.isPending}
            onClick={() => saveCfg.mutate({ backup_keep: sys.backup_keep, backup_dir: "" })}
          >
            Standardordner verwenden
          </button>
        </div>
      </form>
    </Section>
  );
}

function IntegrityCard({ sys }: { sys: Json }) {
  const qc = useQueryClient();
  const { toast } = useUi();
  const run = useMutation({
    mutationFn: () => api.post<Json>("/api/system/integrity-check"),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["system"] });
      toast(r.ok ? "Das Archiv ist in Ordnung" : "Die Prüfung hat einen Fehler gefunden", r.ok ? "ok" : "bad");
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  const r = sys.integrity ?? {};
  return (
    <Section
      id="st-integrity"
      title="Archiv prüfen"
      intro="Die Prüfung stellt fest, ob die Archivdatei unbeschädigt ist. Das Programm macht sie einmal pro Woche von selbst."
    >
      <p data-testid="integrity-result">
        {r.ok === true ? (
          <Badge tone="green">✓ In Ordnung</Badge>
        ) : r.ok === false ? (
          <Badge tone="red">✕ Fehler gefunden</Badge>
        ) : (
          <Badge tone="gray">Noch nicht geprüft</Badge>
        )}
        {r.at ? (
          <span className="muted" style={{ marginLeft: ".5rem" }}>
            Zuletzt geprüft: {localTime(r.at)}
          </span>
        ) : null}
      </p>
      {r.ok === false ? (
        <div className="notice bad" role="alert" style={{ marginBottom: "1rem" }}>
          Die Archivdatei ist beschädigt. Mache keine weiteren Änderungen. Kopiere die Datei zur Sicherheit an einen
          anderen Ort und spiele dann die neueste Sicherung ein (Anleitung unten).
        </div>
      ) : null}
      <div className="actions">
        <button className="btn secondary" onClick={() => run.mutate()} disabled={run.isPending}>
          Archiv jetzt prüfen
        </button>
        {run.isPending ? <Spinner label="Prüfung läuft …" /> : null}
      </div>
    </Section>
  );
}

function RestoreCard({ sys }: { sys: Json }) {
  const file: string = sys.storage.vault_path;
  return (
    <Section
      id="st-restore"
      title="Sicherung zurückspielen"
      intro="Dafür gibt es keine Schaltfläche. Eine Sicherung ist eine normale Datei, die du selbst an die richtige Stelle kopierst."
    >
      <h3>Wenn das Archiv auf diesem Computer beschädigt ist</h3>
      <ol className="st-steps">
        <li>Beende Save Your Documents über das Symbol im Infobereich der Taskleiste.</li>
        <li>
          Verschiebe die beschädigte Datei <span className="mono">{file}</span> samt Dateien mit den Endungen{" "}
          <span className="mono">-wal</span> und <span className="mono">-shm</span> in einen anderen Ordner. Lösche sie nicht.
        </li>
        <li>
          Kopiere die neueste Sicherung aus dem Sicherungsordner in den Archivordner und gib ihr denselben Namen wie
          der ursprünglichen Archivdatei.
        </li>
        <li>Starte das Programm wieder.</li>
      </ol>
      <h3>Wenn du auf einem neuen Computer arbeitest</h3>
      <ol className="st-steps">
        <li>Installiere Save Your Documents und starte es.</li>
        <li>Wähle bei der Einrichtung „Ich habe schon ein Archiv“.</li>
        <li>Gib den Pfad der Sicherungsdatei an und deinen Wiederherstellungsschlüssel oder dein Passwort.</li>
      </ol>
      <div className="notice">
        Ohne Wiederherstellungsschlüssel oder Passwort lässt sich keine Sicherung öffnen. Eine Sicherung braucht immer
        den Schlüssel oder das Passwort, die zum Zeitpunkt der Sicherung galten. Hast du seitdem gewechselt, bewahre
        auch den älteren auf.
      </div>
    </Section>
  );
}

export function BackupTab() {
  const sys = useSystem();
  if (sys.isPending) return <Spinner />;
  if (sys.isError) return <ErrorBox error={sys.error} retry={() => void sys.refetch()} />;
  return (
    <>
      <StorageCard sys={sys.data} />
      <BackupCard sys={sys.data} />
      <IntegrityCard sys={sys.data} />
      <RestoreCard sys={sys.data} />
    </>
  );
}
