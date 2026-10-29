import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorText, type Json } from "../../lib/api";
import { Badge, Field, Modal, Spinner, useUi } from "../ui";
import { copyText, download, FormError, Section, useStable, useStatus, useSystem } from "./shared";

const MIN_PASSWORD = 8;

function PasswordModal({
  mode,
  switching,
  onClose,
  onDone,
}: {
  mode: string;
  switching: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const close = useStable(onClose);
  const isKey = mode !== "password";
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;
  const mismatch = again.length > 0 && next !== again;
  const valid = current.trim() && next.length >= MIN_PASSWORD && next === again;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/api/security/password", { current, new: next });
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={switching ? "Auf Passwort-Schutz wechseln" : "Passwort ändern"}
      onClose={close}
      actions={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={!valid || busy} onClick={() => void submit()}>
            {switching ? "Passwort-Schutz einschalten" : "Passwort ändern"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field
          label={isKey ? "Bisheriger Wiederherstellungsschlüssel" : "Bisheriges Passwort"}
          htmlFor="st-pw-cur"
        >
          <input
            id="st-pw-cur"
            type={isKey ? "text" : "password"}
            className={isKey ? "mono" : ""}
            value={current}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="Neues Passwort" htmlFor="st-pw-new" hint={`Mindestens ${MIN_PASSWORD} Zeichen.`}>
          <input
            id="st-pw-new"
            type="password"
            value={next}
            autoComplete="new-password"
            aria-invalid={tooShort}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        {tooShort ? <p className="err" style={{ marginTop: "-.5rem" }}>Das Passwort ist noch zu kurz.</p> : null}
        <Field label="Neues Passwort wiederholen" htmlFor="st-pw-again">
          <input
            id="st-pw-again"
            type="password"
            value={again}
            autoComplete="new-password"
            aria-invalid={mismatch}
            onChange={(e) => setAgain(e.target.value)}
          />
        </Field>
        {mismatch ? <p className="err" style={{ marginTop: "-.5rem" }}>Die beiden Passwörter sind verschieden.</p> : null}
        <p className="hint">
          Es gibt kein „Passwort vergessen“. Ohne Passwort bleibt das Archiv verschlossen, auch Sicherungen lassen sich
          dann nicht öffnen.
        </p>
        <FormError>{error}</FormError>
        {busy ? <Spinner label="Das Archiv wird neu verschlüsselt. Bitte warten …" /> : null}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

type KeyStep = "secret" | "show" | "done";

function KeyModal({ mode, onClose, onDone }: { mode: string; onClose: () => void; onDone: () => void }) {
  const { toast } = useUi();
  const [step, setStep] = useState<KeyStep>("secret");
  const [current, setCurrent] = useState("");
  const [newKey, setNewKey] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const close = useStable(step === "done" ? onDone : onClose);
  const isKey = mode !== "password";

  const prepare = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.post<Json>("/api/security/key/prepare", { current });
      setNewKey(r.recovery_key);
      setStep("show");
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  };
  const apply = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post("/api/security/key/apply", { secret: again });
      setStep("done");
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  };

  let body: ReactNode;
  let actions: ReactNode;
  if (step === "secret") {
    body = (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (current.trim() && !busy) void prepare();
        }}
      >
        <p style={{ marginTop: 0 }}>
          {isKey
            ? "Zur Sicherheit gib deinen bisherigen Wiederherstellungsschlüssel ein. Danach bekommst du einen neuen Schlüssel."
            : "Zur Sicherheit gib dein Passwort ein. Danach bekommst du einen Schlüssel und das Programm fragt nicht mehr nach dem Passwort."}
        </p>
        <Field label={isKey ? "Bisheriger Wiederherstellungsschlüssel" : "Passwort"} htmlFor="st-key-cur">
          <input
            id="st-key-cur"
            type={isKey ? "text" : "password"}
            className={isKey ? "mono" : ""}
            value={current}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <FormError>{error}</FormError>
        <button type="submit" hidden />
      </form>
    );
    actions = (
      <>
        <button className="btn ghost" onClick={onClose}>
          Abbrechen
        </button>
        <button className="btn primary" disabled={!current.trim() || busy} onClick={() => void prepare()}>
          Neuen Schlüssel erzeugen
        </button>
      </>
    );
  } else if (step === "show") {
    body = (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (again.trim() && !busy) void apply();
        }}
      >
        <p style={{ marginTop: 0 }}>
          Das ist dein neuer Wiederherstellungsschlüssel. Schreibe ihn auf oder speichere ihn außerhalb dieses
          Computers. Ohne ihn kann niemand das Archiv öffnen, wenn der Computer kaputtgeht.
        </p>
        <div className="st-keybox" data-testid="recovery-key">
          {newKey}
        </div>
        <div className="row wrap" style={{ marginBottom: "1rem" }}>
          <button
            type="button"
            className="btn secondary small"
            onClick={() =>
              download(
                "Wiederherstellungsschluessel.txt",
                `Save Your Documents\nWiederherstellungsschlüssel:\n${newKey}\n`,
              )
            }
          >
            Als Textdatei speichern
          </button>
          <button
            type="button"
            className="btn secondary small"
            onClick={async () => toast((await copyText(newKey)) ? "Schlüssel kopiert" : "Kopieren ging nicht. Markiere den Schlüssel und kopiere ihn von Hand.", "ok")}
          >
            Kopieren
          </button>
        </div>
        <Field label="Schlüssel zur Bestätigung noch einmal eingeben" htmlFor="st-key-again">
          <input
            id="st-key-again"
            className="mono"
            value={again}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setAgain(e.target.value)}
          />
        </Field>
        <p className="hint">
          Solange du nicht bestätigst, bleibt alles beim Alten. Sicherungen von früher lassen sich nur mit dem
          Schlüssel oder Passwort öffnen, das damals galt. Bewahre diesen also weiter auf.
        </p>
        <FormError>{error}</FormError>
        {busy ? <Spinner label="Das Archiv wird neu verschlüsselt. Bitte warten und das Programm nicht beenden …" /> : null}
        <button type="submit" hidden />
      </form>
    );
    actions = (
      <>
        <button className="btn ghost" onClick={onClose} disabled={busy}>
          Abbrechen
        </button>
        <button className="btn primary" disabled={!again.trim() || busy} onClick={() => void apply()}>
          Neuen Schlüssel übernehmen
        </button>
      </>
    );
  } else {
    body = (
      <div className="notice good" role="status">
        <p style={{ margin: 0 }}>
          Fertig. Das Archiv ist jetzt mit dem neuen Schlüssel geschützt, das Programm öffnet es beim Start
          automatisch. Bewahre den neuen Schlüssel sicher auf.
        </p>
      </div>
    );
    actions = (
      <button className="btn primary" onClick={onDone}>
        Schließen
      </button>
    );
  }
  return (
    <Modal title={step === "done" ? "Neuer Schlüssel ist aktiv" : "Neuen Schlüssel erzeugen"} onClose={close} wide actions={actions}>
      {body}
    </Modal>
  );
}

export function SecurityTab() {
  const qc = useQueryClient();
  const { toast, confirm } = useUi();
  const status = useStatus();
  const sys = useSystem();
  const [dialog, setDialog] = useState<null | "password" | "to-password" | "key">(null);
  const [lockError, setLockError] = useState("");

  const mode: string | undefined = status.data?.mode ?? undefined;
  const keyStore: string | undefined = sys.data?.key_store ?? status.data?.key_store;
  if (!mode) return <Spinner />;

  const refreshAll = () => {
    setDialog(null);
    void qc.invalidateQueries();
  };

  const toPassword = async () => {
    const ok = await confirm({
      title: "Auf Passwort-Schutz wechseln?",
      text: "Ab jetzt fragt das Programm bei jedem Start nach dem Passwort. Empfang vom Handy und Erinnerungen laufen erst, nachdem du es eingegeben hast. Vergisst du das Passwort, kann niemand das Archiv öffnen.",
      confirmLabel: "Weiter",
    });
    if (ok) setDialog("to-password");
  };
  const toKey = async (fresh: boolean) => {
    const ok = await confirm({
      title: fresh ? "Neuen Schlüssel erzeugen?" : "Auf Schlüssel-Schutz wechseln?",
      text: fresh
        ? "Das Archiv wird mit einem neuen Schlüssel neu verschlüsselt. Der alte Schlüssel gilt danach nur noch für ältere Sicherungen. Das dauert je nach Größe des Archivs eine Weile."
        : "Das Programm öffnet das Archiv danach beim Start automatisch, ohne Passwort. Du bekommst einen Wiederherstellungsschlüssel, den du sicher aufbewahren musst.",
      confirmLabel: "Weiter",
    });
    if (ok) setDialog("key");
  };
  const lock = async () => {
    const ok = await confirm({
      title: "Archiv jetzt sperren?",
      text: "Empfang vom Handy und Erinnerungen pausieren, bis du das Passwort wieder eingibst.",
      confirmLabel: "Archiv sperren",
    });
    if (!ok) return;
    try {
      await api.post("/api/lock");
      void qc.invalidateQueries({ queryKey: ["status"] });
    } catch (e) {
      setLockError(errorText(e));
      toast(errorText(e), "bad");
    }
  };

  return (
    <>
      <Section id="st-prot" title="Schutz des Archivs">
        <p>
          {mode === "password" ? <Badge tone="blue">Passwort-Schutz</Badge> : <Badge tone="green">Schlüssel-Schutz</Badge>}
        </p>
        {mode === "password" ? (
          <p>
            Das Archiv ist mit deinem Passwort verschlüsselt. Beim Start fragt das Programm danach. Empfang vom Handy
            und Erinnerungen laufen erst nach der Eingabe.
          </p>
        ) : (
          <p>
            Das Archiv ist verschlüsselt und wird beim Start automatisch geöffnet.{" "}
            {keyStore === "dpapi"
              ? "Der Schlüssel ist an dein Windows-Konto gebunden."
              : "Der Schlüssel liegt in einer geschützten Datei im Datenordner des Programms."}{" "}
            Auf einem anderen Computer oder nach einer Neuinstallation von Windows brauchst du den
            Wiederherstellungsschlüssel.
          </p>
        )}
        <div className="actions">
          {mode === "password" ? (
            <>
              <button className="btn secondary" onClick={() => setDialog("password")}>
                Passwort ändern
              </button>
              <button className="btn secondary" onClick={() => void toKey(false)}>
                Auf Schlüssel-Schutz wechseln
              </button>
              <button className="btn secondary" onClick={() => void lock()}>
                Archiv sperren
              </button>
            </>
          ) : (
            <>
              <button className="btn secondary" onClick={() => void toPassword()}>
                Auf Passwort-Schutz wechseln
              </button>
              <button className="btn secondary" onClick={() => void toKey(true)}>
                Neuen Schlüssel erzeugen
              </button>
            </>
          )}
        </div>
        <FormError>{lockError}</FormError>
      </Section>

      <Section id="st-recov" title="Wiederherstellungsschlüssel">
        <p>
          Aus Sicherheitsgründen kann das Programm einen bereits vergebenen Schlüssel nicht noch einmal anzeigen. Das
          schützt dich auch, wenn jemand anderes kurz an deinen Computer kommt.
        </p>
        <p className="hint" style={{ marginTop: 0 }}>
          {mode === "password"
            ? "Mit Passwort-Schutz gibt es keinen Wiederherstellungsschlüssel. Das Passwort ist der einzige Zugang."
            : "Hast du deinen Schlüssel verloren und das Programm läuft noch, erzeuge oben einen neuen und bewahre ihn sicher auf. Ist er weg und das Programm läuft nicht mehr, ist das Archiv nicht zu retten."}
        </p>
      </Section>

      {dialog === "password" || dialog === "to-password" ? (
        <PasswordModal mode={mode} switching={dialog === "to-password"} onClose={() => setDialog(null)} onDone={() => {
            toast(dialog === "to-password" ? "Passwort-Schutz ist aktiv" : "Passwort geändert");
            refreshAll();
          }} />
      ) : null}
      {dialog === "key" ? <KeyModal mode={mode} onClose={() => setDialog(null)} onDone={refreshAll} /> : null}
    </>
  );
}
