import { type Json } from "../../lib/api";
import { useNav } from "../../lib/nav";

/** Erklaerung fuer ein leeres Archiv: die drei Schritte und die LocalSend-Anleitung. */
export function Onboarding({ status }: { status: Json | undefined }) {
  const { go } = useNav();
  const alias: string = status?.alias ?? "Save Your Documents";
  const running = Boolean(status?.running);

  return (
    <section className="card" aria-labelledby="start-title">
      <h2 id="start-title">So fängst du an</h2>
      <p className="muted" style={{ marginTop: 0, marginBottom: "1.25rem" }}>
        Dein Archiv ist noch leer. In drei Schritten kommen deine ersten Dokumente hinein.
      </p>
      <ol className="steps">
        <li>
          <span className="num" aria-hidden="true">
            1
          </span>
          <div>
            <h3>Foto vom Handy senden</h3>
            <p>Mache mit dem Handy ein Foto vom Dokument und sende es mit der App LocalSend an diesen Computer.</p>
          </div>
        </li>
        <li>
          <span className="num" aria-hidden="true">
            2
          </span>
          <div>
            <h3>Fotos sortieren</h3>
            <p>Lege zusammengehörige Seiten zu einem Dokument zusammen. Danach erkennt das Programm Firma, Datum, Betrag und Fristen.</p>
          </div>
        </li>
        <li>
          <span className="num" aria-hidden="true">
            3
          </span>
          <div>
            <h3>Prüfen</h3>
            <p>Kontrolliere, was erkannt wurde, und bestätige es. Erst geprüfte Dokumente zählen für Fristen und Auswertungen.</p>
          </div>
        </li>
      </ol>

      <div className="suggest" style={{ marginBottom: 0 }}>
        <h3>So sendest du Fotos mit LocalSend</h3>
        {running ? (
          <ol className="numbered">
            <li>Beide Geräte müssen im selben WLAN sein.</li>
            <li>Öffne LocalSend auf dem Handy und wähle das Foto aus.</li>
            <li>
              Tippe auf das Gerät <strong className="mono">„{alias}“</strong>.
            </li>
            <li>Bestätige die Anfrage hier im Programm.</li>
          </ol>
        ) : (
          <p>
            Der Empfang vom Handy ist gerade nicht bereit. Schalte ihn in den Einstellungen ein oder prüfe, ob der Port von einem anderen
            Programm belegt wird.
          </p>
        )}
        <div className="row wrap">
          {!running ? (
            <button className="btn primary small" onClick={() => go("settings", { tab: "empfang" })}>
              Empfang einstellen
            </button>
          ) : null}
          <button className="btn primary small" onClick={() => go("import")}>
            Fotos vom Computer auswählen
          </button>
        </div>
      </div>
    </section>
  );
}
