import { useState } from "react";
import { Modal } from "./ui";
import type { View } from "../lib/nav";

type Step = { title: string; view?: View; body: string[] };

const STEPS: Step[] = [
  {
    title: "Willkommen bei Save Your Documents",
    view: "start",
    body: [
      "Hier sammelst du deine wichtigen Papiere an einem Ort: Rechnungen, Verträge, Briefe vom Amt.",
      "Alles bleibt verschlüsselt auf diesem Computer. Nichts geht ins Internet.",
      "Diese kurze Tour zeigt dir in 6 Schritten, wie es geht. Du kannst sie jederzeit überspringen.",
    ],
  },
  {
    title: "1. Fotos und Scans hereinholen",
    view: "import",
    body: [
      "Fotografiere ein Papier mit dem Handy und sende es per LocalSend an diesen Computer. Oder ziehe Fotos und PDFs einfach in das Feld unter „Fotos sortieren“.",
      "Gehören mehrere Fotos zu einem Dokument, zum Beispiel die Seiten eines Briefs, fasst du sie dort zusammen.",
    ],
  },
  {
    title: "2. Das Programm liest mit",
    view: "review",
    body: [
      "Nach dem Sortieren liest das Programm den Text und erkennt Firma, Datum, Betrag und Art des Dokuments. Das dauert nur wenige Sekunden.",
      "Unter „Prüfen“ siehst du das Ergebnis. Stimmt es, bestätigst du mit einem Klick. Stimmt etwas nicht, korrigierst du es kurz.",
    ],
  },
  {
    title: "3. Dokumente wiederfinden",
    view: "docs",
    body: [
      "Unter „Dokumente“ liegt alles geordnet. Oben im Suchfeld findest du ein Dokument über Firma, Betrag oder ein Stichwort aus dem Text.",
    ],
  },
  {
    title: "4. Fristen nicht verpassen",
    view: "fristen",
    body: [
      "Erkennt das Programm eine Frist, zum Beispiel eine Zahlungsfrist oder ein Vertragsende, erscheint sie unter „Fristen“.",
      "Du bekommst rechtzeitig eine Erinnerung. Hast du etwas bezahlt, hakst du es dort ab.",
    ],
  },
  {
    title: "5. Sicherung und Hilfe",
    view: "settings",
    body: [
      "Unter „Einstellungen“ legst du eine Sicherung auf einem USB-Stick oder einer externen Festplatte an. Bewahre außerdem deinen Wiederherstellungsschlüssel sicher auf.",
      "Diese Tour findest du jederzeit wieder über den Knopf „Hilfe“ oben rechts. Viel Erfolg!",
    ],
  },
];

export function Tutorial({ onGo, onClose }: { onGo: (v: View) => void; onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const move = (n: number) => {
    setI(n);
    const v = STEPS[n].view;
    if (v) onGo(v);
  };

  return (
    <Modal
      title={step.title}
      onClose={onClose}
      actions={
        <>
          <span className="muted" style={{ marginRight: "auto" }} aria-live="polite">
            Schritt {i + 1} von {STEPS.length}
          </span>
          {last ? null : (
            <button className="btn ghost" onClick={onClose}>
              Überspringen
            </button>
          )}
          {i > 0 ? (
            <button className="btn secondary" onClick={() => move(i - 1)}>
              Zurück
            </button>
          ) : null}
          <button className="btn primary" onClick={() => (last ? onClose() : move(i + 1))} autoFocus>
            {last ? "Fertig" : i === 0 ? "Los geht’s" : "Weiter"}
          </button>
        </>
      }
    >
      {step.body.map((t) => (
        <p key={t} style={{ margin: "0 0 .75rem" }}>
          {t}
        </p>
      ))}
    </Modal>
  );
}
