import { ErrorBox, Spinner } from "../ui";
import { Section, useStatus, useSystem } from "./shared";

export function AboutTab() {
  const status = useStatus();
  const system = useSystem();
  const s = system.data?.storage;
  const folder: string | undefined = s?.vault_path ? s.vault_path.replace(/[\\/][^\\/]*$/, "") : undefined;
  return (
    <>
      <Section id="st-about" title="Über das Programm">
        {status.isPending ? (
          <Spinner />
        ) : status.isError ? (
          <ErrorBox error={status.error} retry={() => void status.refetch()} />
        ) : (
          <dl className="st-kv">
            <dt>Programm</dt>
            <dd>Save Your Documents</dd>
            <dt>Version</dt>
            <dd className="mono" data-testid="app-version">
              {status.data.version}
            </dd>
            <dt>Archivdatei</dt>
            <dd className="mono">{s?.vault_path ?? "–"}</dd>
            <dt>Ordner der Daten</dt>
            <dd className="mono">{folder ?? "–"}</dd>
          </dl>
        )}
      </Section>

      <Section id="st-local" title="Alle Daten bleiben lokal">
        <p>
          Deine Dokumente, die Texterkennung und alle Einstellungen bleiben auf diesem Computer. Das Programm schickt
          nichts ins Internet, und es gibt kein Konto und keine Cloud. Das Archiv ist verschlüsselt gespeichert.
        </p>
        <p>
          Dokumente vom Handy kommen nur über dein eigenes WLAN an. Kopien legt das Programm nur dort ab, wo du es unter
          „Sicherung und Speicher“ festlegst.
        </p>
      </Section>

      <Section id="st-bg" title="Autostart und Hintergrundbetrieb">
        <p>
          Damit das Handy jederzeit Dokumente senden kann und Erinnerungen pünktlich kommen, läuft das Programm im
          Hintergrund weiter, auch wenn du das Fenster schließt. Du erkennst es am Symbol neben der Uhr. Beenden kannst
          du es über das Menü dieses Symbols. Solange das Programm beendet ist, ist der Empfang vom Handy aus.
        </p>
        <p className="muted">Der Start mit Windows wird bei der Installation festgelegt und lässt sich in den Windows-Einstellungen unter „Apps“ und „Autostart“ ändern.</p>
      </Section>

      <Section id="st-licence" title="Lizenz">
        <p>
          Dieses Programm ist für die private Nutzung gedacht. Die Texterkennung nutzt Tesseract, die Handy-Übertragung
          folgt dem offenen LocalSend-Protokoll. Beide Bestandteile haben eigene Lizenzen von ihren Herstellern.
        </p>
      </Section>
    </>
  );
}
