import { useState } from "react";
import { applyFontSize, FONT_SIZES } from "../../lib/display";
import type { Json } from "../../lib/api";
import { Field } from "../ui";
import { FormError, Section, Switch, useSaveSettings } from "./shared";

const SIZE_LABEL: Record<number, string> = { 14: "Dicht", 16: "Normal", 18: "Groß", 20: "Sehr groß" };

const SAMPLE: Record<string, string> = {
  firma: "Telekom",
  art: "Rechnung",
  bereich: "Telefon",
  datum: "2026-09-12",
  jahr: "2026",
  monat: "09",
  betrag: "49,99 €",
  name: "Scan_0042",
};

/** Gleiche Regeln wie im Hintergrunddienst, nur mit festen Beispielwerten. */
function exampleName(template: string): string {
  const text = template
    .split(/(\{[a-z]+\})/)
    .map((tok) => {
      const m = /^\{([a-z]+)\}$/.exec(tok);
      return m ? (SAMPLE[m[1]] ?? "\0") : tok;
    })
    .join("")
    .replace(/(?:[\s_-]*\0)+[\s_-]*/g, "_")
    .replace(/^[\s_-]+|[\s_-]+$/g, "")
    .replace(/[\\/:*?"<>|]/g, "-");
  return text.replace(/[\s_\-\0]/g, "") ? `${text}.pdf` : "Scan_0042.pdf";
}

function FontSizeCard({ settings }: { settings: Json }) {
  const { save, error } = useSaveSettings();
  const current: number = settings.font_size;
  const choose = async (px: number) => {
    if (px === current) return;
    applyFontSize(px);
    if (!(await save({ font_size: px }))) applyFontSize(current);
  };
  return (
    <Section id="st-font" title="Schriftgröße" intro="Gilt für das ganze Programm und wirkt sofort.">
      <div className="st-sizes" role="group" aria-label="Schriftgröße">
        {FONT_SIZES.map((px) => (
          <button key={px} className="st-size" aria-pressed={current === px} onClick={() => void choose(px)}>
            <span className="big">{SIZE_LABEL[px]}</span>
            <span className="sub">{px} Pixel{current === px ? " · gewählt" : ""}</span>
          </button>
        ))}
      </div>
      <FormError>{error}</FormError>
      <div className="st-preview">
        <strong style={{ color: "var(--text-primary)" }}>Vorschau</strong>
        <p style={{ margin: "0.25rem 0 0" }}>
          Telekom · Rechnung · 12.09.2026 · 49,99 €. So groß erscheinen Texte, Schaltflächen und Tabellen.
        </p>
      </div>
    </Section>
  );
}

function NameCard({ settings }: { settings: Json }) {
  const { save, saving, error, clearError } = useSaveSettings();
  const [template, setTemplate] = useState<string>(settings.display_name_template);
  const enabled: boolean = settings.display_name_enabled;
  const dirty = template !== settings.display_name_template;
  return (
    <Section
      id="st-name"
      title="Anzeigename der Dokumente"
      intro="Der Name, unter dem ein Dokument in Listen und beim Export erscheint. Die Originaldatei bleibt unverändert im Archiv."
    >
      <Switch
        checked={enabled}
        onChange={(v) => void save({ display_name_enabled: v })}
        title="Erkannte Angaben im Namen zeigen"
        text="Aus: Es wird der ursprüngliche Dateiname angezeigt."
        testId="sw-display-name"
      />
      <hr className="st-divider" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) void save({ display_name_template: template });
        }}
      >
        <Field
          label="Namensvorlage"
          htmlFor="st-template"
          hint="Fehlende Angaben werden einfach weggelassen. Zum Einfügen eine Angabe wählen:"
        >
          <input
            id="st-template"
            value={template}
            disabled={!enabled}
            spellCheck={false}
            className="mono"
            onChange={(e) => {
              setTemplate(e.target.value);
              clearError();
            }}
          />
        </Field>
        <div className="st-chips" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
          {["firma", "art", "bereich", "datum", "betrag", "name"].map((k) => (
            <button
              key={k}
              type="button"
              disabled={!enabled}
              onClick={() => setTemplate((t) => `${t}${t && !/[_\-\s]$/.test(t) ? "_" : ""}{${k}}`)}
            >
              {`{${k}}`}
            </button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: ".875rem", marginBottom: ".25rem" }}>
          Beispiel
        </div>
        <div className="st-example" data-testid="name-example">
          {enabled ? exampleName(template) : "IMG_0042.jpg"}
        </div>
        <FormError>{error}</FormError>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={!dirty || saving || !enabled}>
            Vorlage speichern
          </button>
          {dirty ? (
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setTemplate(settings.display_name_template);
                clearError();
              }}
            >
              Zurücksetzen
            </button>
          ) : null}
        </div>
      </form>
    </Section>
  );
}

function BatchCard({ settings }: { settings: Json }) {
  const { save, saving, error, clearError } = useSaveSettings();
  const [threshold, setThreshold] = useState<number>(Math.round(settings.batch_confirm_threshold * 100));
  const enabled: boolean = settings.batch_confirm_enabled;
  const dirty = threshold !== Math.round(settings.batch_confirm_threshold * 100);
  return (
    <Section
      id="st-batch"
      title="Sammelbestätigung"
      intro="Unter „Prüfen“ kannst du viele sichere Dokumente mit einem Klick bestätigen."
    >
      <Switch
        checked={enabled}
        onChange={(v) => void save({ batch_confirm_enabled: v })}
        title="Sammelbestätigung anbieten"
        text="Bestätigt werden nur Dokumente ohne offene Frist, bei denen Firma, Datum und Betrag sicher erkannt wurden."
      />
      <hr className="st-divider" />
      <Field
        label="Ab dieser Sicherheit gilt eine Angabe als sicher"
        htmlFor="st-threshold"
        hint="Höher heißt vorsichtiger: Weniger Dokumente werden gesammelt bestätigt, dafür sind sie zuverlässiger erkannt."
      >
        <div className="st-range">
          <input
            id="st-threshold"
            type="range"
            min={50}
            max={100}
            step={5}
            value={threshold}
            disabled={!enabled}
            onChange={(e) => {
              setThreshold(Number(e.target.value));
              clearError();
            }}
          />
          <output htmlFor="st-threshold" data-testid="threshold-value">
            {threshold} %
          </output>
        </div>
      </Field>
      <FormError>{error}</FormError>
      <div className="actions">
        <button
          className="btn primary"
          disabled={!dirty || saving || !enabled}
          onClick={() => void save({ batch_confirm_threshold: threshold / 100 })}
        >
          Schwelle speichern
        </button>
      </div>
    </Section>
  );
}

function SpaceCard({ settings }: { settings: Json }) {
  const { save, error } = useSaveSettings();
  return (
    <Section
      id="st-space"
      title="Platz sparen"
      intro="Handyfotos sind oft mehrere Megabyte groß. Weil nichts gelöscht wird, wächst die Archivdatei nur."
    >
      <Switch
        checked={settings.space_saving}
        onChange={(v) => void save({ space_saving: v })}
        title="Fotos beim Import verkleinern"
        text="Aus (Standard): Jedes Original bleibt unverändert erhalten. Das ist am sichersten, braucht aber am meisten Platz."
        testId="sw-space"
      />
      <p className="hint" style={{ marginLeft: "4.9rem" }}>
        An: Neue Fotos werden kleiner abgespeichert. Das Archiv bleibt deutlich schlanker, das unveränderte Original ist
        dann nicht mehr vorhanden. Schon gespeicherte Dokumente werden nicht verändert.
      </p>
      <FormError>{error}</FormError>
    </Section>
  );
}

export function DisplayTab({ settings }: { settings: Json }) {
  return (
    <>
      <FontSizeCard settings={settings} />
      <NameCard settings={settings} />
      <BatchCard settings={settings} />
      <SpaceCard settings={settings} />
    </>
  );
}
