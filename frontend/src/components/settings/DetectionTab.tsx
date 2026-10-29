import { useState } from "react";
import type { Json } from "../../lib/api";
import { Badge, Field, Spinner } from "../ui";
import { FormError, Section, Switch, useSaveSettings, useSystem } from "./shared";

function BasicCard() {
  const sys = useSystem();
  const ocr = sys.data?.ocr;
  return (
    <Section
      id="st-ocr"
      title="Texterkennung"
      intro="Das Programm liest Fotos und Scans mit einer Texterkennung (OCR) und erkennt Firma, Datum, Betrag und Art des Dokuments. Das passiert vollständig auf diesem Computer."
    >
      {ocr ? (
        <p style={{ margin: 0 }}>
          {ocr.available ? (
            <Badge tone="green">✓ Deutsche Texterkennung bereit</Badge>
          ) : (
            <Badge tone="red">✕ Deutsche Sprachdaten fehlen</Badge>
          )}
          {!ocr.available ? (
            <span className="muted" style={{ display: "block", marginTop: ".5rem" }}>
              Ohne die deutschen Sprachdaten kann das Programm keinen Text lesen. Installiere das Programm neu oder
              wende dich an den Support.
            </span>
          ) : null}
        </p>
      ) : (
        <Spinner />
      )}
    </Section>
  );
}

function OllamaCard({ settings }: { settings: Json }) {
  const sys = useSystem();
  const { save, saving, error, clearError } = useSaveSettings();
  const [url, setUrl] = useState<string>(settings.ollama_url);
  const [model, setModel] = useState<string>(settings.ollama_model);
  const [testing, setTesting] = useState(false);
  const enabled: boolean = settings.ollama_enabled;
  const dirty = url !== settings.ollama_url || model !== settings.ollama_model;
  const status: Json | null | undefined = sys.data?.ollama;

  const test = async () => {
    setTesting(true);
    await sys.refetch();
    setTesting(false);
  };

  const models: string[] = status?.models ?? [];
  return (
    <Section
      id="st-ollama"
      title="Bessere Erkennung mit Ollama (optional)"
      intro="Ollama ist ein kostenloses Programm, das ein Sprachmodell auf deinem Computer ausführt. Es hilft bei Angaben, bei denen sich die normale Erkennung unsicher ist."
    >
      <div className="notice good" style={{ marginBottom: "1rem" }}>
        <strong style={{ color: "var(--text-primary)" }}>Nichts verlässt deinen Computer.</strong> Die Adresse muss auf
        diesen Computer zeigen (127.0.0.1 oder localhost). Verbindungen ins Internet sind nicht möglich. Es wird nur der
        erkannte Text eines Dokuments an Ollama auf diesem Computer übergeben.
      </div>
      <Switch
        checked={enabled}
        onChange={(v) => void save({ ollama_enabled: v })}
        title="Ollama verwenden"
        text="Aus (Standard): Es läuft nur die normale Erkennung. Ein Sprachmodell braucht mehrere Gigabyte Arbeitsspeicher und rechnet ohne Grafikkarte langsam."
        testId="sw-ollama"
      />
      <hr className="st-divider" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) void save({ ollama_url: url.trim(), ollama_model: model.trim() });
        }}
      >
        <Field label="Adresse von Ollama" htmlFor="st-ollama-url" hint="Normalerweise http://127.0.0.1:11434.">
          <input
            id="st-ollama-url"
            value={url}
            className="mono"
            spellCheck={false}
            disabled={!enabled}
            onChange={(e) => {
              setUrl(e.target.value);
              clearError();
            }}
          />
        </Field>
        <Field label="Modell" htmlFor="st-ollama-model" hint="Der Name des Modells, das du in Ollama installiert hast.">
          <input
            id="st-ollama-model"
            value={model}
            className="mono"
            spellCheck={false}
            list="st-ollama-models"
            disabled={!enabled}
            onChange={(e) => {
              setModel(e.target.value);
              clearError();
            }}
          />
          <datalist id="st-ollama-models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <FormError>{error}</FormError>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={!dirty || saving || !enabled}>
            Speichern
          </button>
          <button className="btn secondary" type="button" onClick={() => void test()} disabled={!enabled || dirty || testing}>
            Verbindung testen
          </button>
          {testing ? <Spinner label="Teste …" /> : null}
        </div>
        {enabled && dirty ? <p className="hint">Speichere die Änderungen, bevor du die Verbindung testest.</p> : null}
        {!enabled ? <p className="hint">Schalte Ollama ein, um die Verbindung zu testen.</p> : null}
      </form>
      {enabled && status ? (
        <div style={{ marginTop: "1rem" }} data-testid="ollama-status" aria-live="polite">
          {status.reachable ? (
            <>
              <Badge tone="green">✓ Verbunden</Badge>
              <p className="hint">
                {models.length
                  ? `Gefundene Modelle: ${models.join(", ")}.`
                  : "Ollama antwortet, hat aber noch kein Modell installiert."}
                {models.length && !models.includes(settings.ollama_model)
                  ? ` Das Modell „${settings.ollama_model}“ ist in Ollama nicht installiert.`
                  : ""}
              </p>
            </>
          ) : (
            <>
              <Badge tone="yellow">! Keine Antwort</Badge>
              <p className="hint">
                Ollama antwortet nicht. Starte Ollama auf diesem Computer und prüfe die Adresse. Die normale Erkennung
                arbeitet in der Zwischenzeit weiter.
              </p>
            </>
          )}
        </div>
      ) : null}
    </Section>
  );
}

export function DetectionTab({ settings }: { settings: Json }) {
  return (
    <>
      <BasicCard />
      <OllamaCard settings={settings} />
    </>
  );
}
