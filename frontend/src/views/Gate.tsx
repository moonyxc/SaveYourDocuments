import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorText, type Json } from "../lib/api";
import { Field, Modal } from "../components/ui";

type Status = { state: string; reason: string | null; mode: string | null; setup_pending: boolean; version: string };

function Frame({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main style={{ maxWidth: wide ? "44rem" : "32rem", margin: "0 auto", padding: "3rem 1.25rem" }}>
      <div className="mono muted" style={{ fontSize: ".75rem", letterSpacing: ".08em", textTransform: "uppercase" }}>
        Save Your Documents
      </div>
      {children}
    </main>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Erststart: Schutzart waehlen, Schluessel sichern, Rueckeingabe. */
export function Setup({ status }: { status: Status }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"key" | "password">("key");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [folder, setFolder] = useState("");
  const [existing, setExisting] = useState(false);
  const [openPath, setOpenPath] = useState("");
  const [openSecret, setOpenSecret] = useState("");
  const [created, setCreated] = useState<Json | null>(
    status.setup_pending ? { resumed: true, mode: status.mode ?? "key" } : null,
  );
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");

  const done = () => qc.invalidateQueries({ queryKey: ["status"] });
  const create = useMutation({
    mutationFn: () =>
      api.post("/api/setup/create", {
        mode,
        password: mode === "password" ? password : undefined,
        vault_dir: folder.trim() || undefined,
      }),
    onSuccess: (r) => {
      setError("");
      setCreated(r);
    },
    onError: (e) => setError(errorText(e)),
  });
  const confirm = useMutation({
    mutationFn: () => api.post("/api/setup/confirm", { secret: again }),
    onSuccess: done,
    onError: (e) => setError(errorText(e)),
  });
  const open = useMutation({
    mutationFn: () => api.post("/api/setup/open-existing", { path: openPath, secret: openSecret }),
    onSuccess: done,
    onError: (e) => setError(errorText(e)),
  });

  const passwordOk = password.length >= 8 && password === password2;

  if (created) {
    const isKey = created.mode === "key";
    return (
      <Frame wide>
        <h1 style={{ fontSize: "1.75rem", marginTop: ".5rem" }}>
          {isKey ? "Sichere deinen Wiederherstellungsschlüssel" : "Bestätige dein Passwort"}
        </h1>
        {isKey && created.recovery_key ? (
          <>
            <p className="lead">
              Dein Archiv ist mit diesem Schlüssel verschlüsselt. Ohne ihn kann niemand die Dokumente lesen, auch wir nicht.
              Wenn der Computer kaputtgeht, ist er die einzige Möglichkeit, eine Sicherung zu öffnen. Schreibe ihn auf
              oder speichere ihn außerhalb dieses Computers.
            </p>
            <div
              className="card mono"
              style={{ fontSize: "1.25rem", letterSpacing: ".05em", color: "var(--text-primary)", wordBreak: "break-word" }}
              data-testid="recovery-key"
            >
              {created.recovery_key}
            </div>
            <div className="row wrap" style={{ margin: "1rem 0" }}>
              <button
                className="btn secondary"
                onClick={() => download("Wiederherstellungsschluessel.txt", `Save Your Documents\nWiederherstellungsschlüssel:\n${created.recovery_key}\n`)}
              >
                Als Textdatei speichern
              </button>
              <button className="btn secondary" onClick={() => window.print()}>
                Drucken
              </button>
              <button
                className="btn secondary"
                onClick={() => void navigator.clipboard?.writeText(created.recovery_key)}
              >
                Kopieren
              </button>
            </div>
          </>
        ) : (
          <p className="lead">
            Gib dein Passwort noch einmal ein, damit sicher ist, dass du es richtig getippt hast. Es gibt keine
            „Passwort vergessen“-Funktion: Ohne das Passwort bleibt das Archiv verschlossen.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirm.mutate();
          }}
        >
          <Field label={isKey ? "Schlüssel zur Bestätigung noch einmal eingeben" : "Passwort noch einmal eingeben"} htmlFor="again">
            <input
              id="again"
              type={isKey ? "text" : "password"}
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={isKey ? "mono" : ""}
              autoFocus
            />
          </Field>
          {error ? (
            <p className="err" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn primary" disabled={!again.trim() || confirm.isPending} type="submit">
            Archiv fertig einrichten
          </button>
        </form>
      </Frame>
    );
  }

  return (
    <Frame wide>
      <h1 style={{ fontSize: "1.75rem", marginTop: ".5rem" }}>Willkommen. Richte dein Dokumentenarchiv ein.</h1>
      <p className="lead">
        Alles bleibt auf diesem Computer, in einer einzigen verschlüsselten Datei. Nichts wird ins Internet geschickt.
        Wie soll das Archiv geschützt werden?
      </p>

      <div className="stack" role="radiogroup" aria-label="Schutzart">
        {(
          [
            ["key", "Schlüssel (empfohlen)", "Das Programm öffnet das Archiv automatisch. Du bekommst einen Wiederherstellungsschlüssel, den du sicher aufbewahrst."],
            ["password", "Passwort", "Das Programm fragt bei jedem Start nach dem Passwort. Empfang und Erinnerungen laufen erst danach."],
          ] as const
        ).map(([v, title, text]) => (
          <button
            key={v}
            role="radio"
            aria-checked={mode === v}
            className="card"
            style={{
              textAlign: "left",
              cursor: "pointer",
              borderColor: mode === v ? "var(--accent-primary)" : undefined,
              background: mode === v ? "var(--accent-muted)" : undefined,
            }}
            onClick={() => setMode(v)}
          >
            <strong style={{ color: "var(--text-primary)" }}>{title}</strong>
            <div style={{ color: mode === v ? "#fff" : "var(--text-muted)" }}>{text}</div>
          </button>
        ))}
      </div>

      {mode === "password" ? (
        <div style={{ marginTop: "1rem" }}>
          <Field label="Passwort" hint="Mindestens 8 Zeichen." htmlFor="pw">
            <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Passwort wiederholen" htmlFor="pw2">
            <input id="pw2" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
      ) : null}

      <details style={{ margin: "1rem 0" }}>
        <summary style={{ cursor: "pointer" }}>Speicherort ändern (optional)</summary>
        <Field label="Ordner für die Archivdatei" hint="Voreinstellung: der Datenordner dieses Windows-Kontos. Der Ordner muss schon existieren." htmlFor="folder">
          <input id="folder" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="D:\Dokumente" spellCheck={false} />
        </Field>
      </details>

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row wrap">
        <button className="btn primary" disabled={create.isPending || (mode === "password" && !passwordOk)} onClick={() => create.mutate()}>
          Weiter
        </button>
        <button className="btn ghost" onClick={() => setExisting(true)}>
          Ich habe schon ein Archiv
        </button>
      </div>
      {mode === "password" && password && !passwordOk ? (
        <p className="hint">{password.length < 8 ? "Das Passwort ist noch zu kurz." : "Die beiden Passwörter sind verschieden."}</p>
      ) : null}

      {existing ? (
        <Modal
          title="Vorhandenes Archiv öffnen"
          onClose={() => setExisting(false)}
          actions={
            <>
              <button className="btn ghost" onClick={() => setExisting(false)}>
                Abbrechen
              </button>
              <button className="btn primary" disabled={!openPath.trim() || !openSecret || open.isPending} onClick={() => open.mutate()}>
                Archiv öffnen
              </button>
            </>
          }
        >
          <Field label="Pfad zur Archivdatei (.syd)" htmlFor="op">
            <input id="op" value={openPath} onChange={(e) => setOpenPath(e.target.value)} spellCheck={false} placeholder="D:\Sicherung\archiv.syd" />
          </Field>
          <Field label="Wiederherstellungsschlüssel oder Passwort" htmlFor="os">
            <input id="os" type="password" value={openSecret} onChange={(e) => setOpenSecret(e.target.value)} autoComplete="off" />
          </Field>
          {error ? <p className="err">{error}</p> : null}
        </Modal>
      ) : null}
    </Frame>
  );
}

const REASONS: Record<string, string> = {
  passwort: "Gib dein Passwort ein, um das Archiv zu öffnen.",
  schluessel_fehlt:
    "Der gespeicherte Schlüssel wurde auf diesem Computer nicht gefunden. Gib deinen Wiederherstellungsschlüssel ein.",
  schluessel_falsch:
    "Der gespeicherte Schlüssel passt nicht zum Archiv. Gib deinen Wiederherstellungsschlüssel ein.",
  archiv_fehlt:
    "Die Archivdatei wurde nicht gefunden. Prüfe, ob der Ordner oder das Laufwerk verfügbar ist, und versuche es dann noch einmal.",
};

export function Unlock({ status }: { status: Status }) {
  const qc = useQueryClient();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const unlock = useMutation({
    mutationFn: () => api.post("/api/unlock", { secret }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["status"] }),
    onError: (e) => setError(errorText(e)),
  });
  const isKey = status.reason === "schluessel_fehlt" || status.reason === "schluessel_falsch";
  return (
    <Frame>
      <h1 style={{ fontSize: "1.75rem", marginTop: ".5rem" }}>Archiv ist gesperrt</h1>
      <p className="lead">{REASONS[status.reason ?? "passwort"] ?? REASONS.passwort}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          unlock.mutate();
        }}
      >
        <Field label={isKey ? "Wiederherstellungsschlüssel" : "Passwort"} htmlFor="secret">
          <input
            id="secret"
            type={isKey ? "text" : "password"}
            className={isKey ? "mono" : ""}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
        </Field>
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn primary" type="submit" disabled={!secret || unlock.isPending}>
          Archiv öffnen
        </button>
      </form>
    </Frame>
  );
}
