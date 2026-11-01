import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { View } from "../lib/nav";

type Place = "right" | "bottom" | "left" | "top" | "center";
type Step = {
  title: string;
  text: string;
  tip?: string;
  view: View;
  target?: string; // Wert von data-tour
  place: Place;
  art?: "flow";
};

const STEPS: Step[] = [
  {
    title: "Willkommen!",
    text: "Hier sammelst du deine wichtigen Papiere an einem Ort: Rechnungen, Verträge, Briefe vom Amt. Alles bleibt verschlüsselt auf diesem Computer.",
    tip: "Die Tour dauert eine Minute. Mit der Esc-Taste kannst du sie jederzeit beenden.",
    view: "start",
    place: "center",
    art: "flow",
  },
  {
    title: "Hier fängt alles an: Fotos sortieren",
    text: "Fotografiere ein Papier mit dem Handy und sende es per LocalSend an diesen Computer. Oder ziehe Fotos und PDFs einfach in das große Feld auf dieser Seite.",
    tip: "Mehrere Fotos, die zusammengehören (etwa Seiten eines Briefs), fasst du hier zu einem Dokument zusammen.",
    view: "import",
    target: "nav-import",
    place: "right",
  },
  {
    title: "Das Programm liest mit",
    text: "Nach dem Sortieren erkennt das Programm Firma, Datum, Betrag und Art des Dokuments. Unter „Prüfen“ siehst du das Ergebnis.",
    tip: "Stimmt alles, bestätigst du mit einem Klick. Stimmt etwas nicht, tippst du es kurz um.",
    view: "review",
    target: "nav-review",
    place: "right",
  },
  {
    title: "Dokumente wiederfinden",
    text: "Alles liegt geordnet unter „Dokumente“. Du kannst nach Firma, Jahr oder Art filtern und jedes Dokument öffnen.",
    view: "docs",
    target: "nav-docs",
    place: "right",
  },
  {
    title: "Schnell suchen",
    text: "Tippe oben eine Firma, einen Betrag oder ein Wort aus dem Brief ein. Das Programm sucht im gelesenen Text aller Dokumente.",
    tip: "Beispiel: „Telekom“ oder „Kündigung“.",
    view: "docs",
    target: "search",
    place: "bottom",
  },
  {
    title: "Keine Frist verpassen",
    text: "Erkennt das Programm eine Frist, etwa eine Zahlungsfrist oder ein Vertragsende, steht sie unter „Fristen“. Du bekommst rechtzeitig eine Erinnerung.",
    view: "fristen",
    target: "nav-fristen",
    place: "right",
  },
  {
    title: "Sicherung nicht vergessen",
    text: "In den Einstellungen legst du eine Sicherung auf einem USB-Stick oder einer externen Festplatte an. Bewahre auch deinen Wiederherstellungsschlüssel sicher auf.",
    view: "settings",
    target: "nav-settings",
    place: "right",
  },
  {
    title: "Hilfe gibt es immer",
    text: "Mit diesem Knopf startest du die Tour jederzeit neu. Du bist startklar!",
    view: "start",
    target: "help",
    place: "bottom",
  },
];

type Box = { x: number; y: number; w: number; h: number };
const PAD = 8;
const CARD_W = 380;

function measure(sel?: string): Box | null {
  if (!sel) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${sel}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
}

function cardPos(box: Box | null, place: Place, cardH: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const w = Math.min(CARD_W, vw - 32);
  if (!box || place === "center") return { left: (vw - w) / 2, top: Math.max(16, (vh - cardH) / 2) };
  let left = box.x + box.w + 20;
  let top = box.y - 12;
  if (place === "bottom") {
    left = box.x + box.w / 2 - w / 2;
    top = box.y + box.h + 20;
  } else if (place === "left") {
    left = box.x - w - 20;
  } else if (place === "top") {
    left = box.x + box.w / 2 - w / 2;
    top = box.y - cardH - 20;
  }
  return { left: clamp(left, 16, vw - w - 16), top: clamp(top, 16, vh - cardH - 16) };
}

function FlowArt() {
  const items = [
    ["📷", "Foto"],
    ["🔎", "Lesen"],
    ["🗂️", "Archiv"],
  ];
  return (
    <div className="tour-flow" aria-hidden="true">
      {items.map(([icon, label], i) => (
        <div className="tour-flow-item" key={label} style={{ animationDelay: `${i * 0.35}s` }}>
          <span className="tour-flow-icon">{icon}</span>
          <span>{label}</span>
          {i < items.length - 1 ? <i className="tour-flow-arrow" style={{ animationDelay: `${i * 0.35 + 0.2}s` }} /> : null}
        </div>
      ))}
    </div>
  );
}

export function Tutorial({ onGo, onClose }: { onGo: (v: View) => void; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(260);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const update = useCallback(() => {
    setBox(measure(STEPS[i].target));
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [i]);

  useLayoutEffect(() => {
    onGo(step.view);
    // Die Ansicht rendert erst nach dem Wechsel; danach neu messen.
    update();
    const t = window.setTimeout(update, 120);
    return () => window.clearTimeout(t);
  }, [i, step.view, onGo, update]);

  useEffect(() => {
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [update]);

  const next = useCallback(() => (last ? onClose() : setI((n) => n + 1)), [last, onClose]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [next, back, onClose]);

  const pos = cardPos(box, step.place, cardH);
  const arrow = box && step.place !== "center" ? step.place : null;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Kurze Tour durch das Programm">
      <div className="tour-block" />
      {box ? (
        <div className="tour-spot" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div
        ref={cardRef}
        key={i}
        className={`tour-card ${arrow ? `arrow-${arrow}` : ""}`}
        style={{ left: pos.left, top: pos.top, width: Math.min(CARD_W, window.innerWidth - 32) }}
      >
        <div className="tour-steps" aria-hidden="true">
          {STEPS.map((_, n) => (
            <span key={n} className={n === i ? "on" : n < i ? "done" : ""} />
          ))}
        </div>
        {step.art === "flow" ? <FlowArt /> : null}
        <h2>{step.title}</h2>
        <p>{step.text}</p>
        {step.tip ? <p className="tour-tip">💡 {step.tip}</p> : null}
        <div className="tour-actions">
          <span className="muted" aria-live="polite">
            {i + 1} von {STEPS.length}
          </span>
          <span style={{ flex: 1 }} />
          {last ? null : (
            <button className="btn ghost small" onClick={onClose}>
              Überspringen
            </button>
          )}
          {i > 0 ? (
            <button className="btn secondary small" onClick={back}>
              Zurück
            </button>
          ) : null}
          <button className="btn primary small" onClick={next} autoFocus>
            {last ? "Fertig" : i === 0 ? "Los geht’s" : "Weiter"}
          </button>
        </div>
      </div>
    </div>
  );
}
