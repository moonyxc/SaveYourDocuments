import { useCallback, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText, type Json } from "../../lib/api";
import { Field, Modal, useUi } from "../ui";
import "./settings.css";

/** Stabile Funktion, die immer die neueste Fassung aufruft (verhindert, dass Dialoge den Fokus neu setzen). */
export function useStable<A extends unknown[], R>(fn: (...a: A) => R): (...a: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...a: A) => ref.current(...a), []);
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api.get<Json>("/api/settings") });
}

export function useStatus() {
  return useQuery({ queryKey: ["status"], queryFn: () => api.get<Json>("/api/status") });
}

export function useSystem() {
  return useQuery({ queryKey: ["system"], queryFn: () => api.get<Json>("/api/system") });
}

/** Speichert Einstellungen teilweise (PUT /api/settings). Fehler der API bleiben als Text erhalten. */
export function useSaveSettings(opts: { silent?: boolean } = {}) {
  const qc = useQueryClient();
  const { toast } = useUi();
  const [error, setError] = useState("");
  const m = useMutation({
    mutationFn: (changes: Json) => api.put<Json>("/api/settings", changes),
    onSuccess: (data) => {
      qc.setQueryData(["settings"], data);
      void qc.invalidateQueries({ queryKey: ["system"] });
      setError("");
      if (!opts.silent) toast("Gespeichert");
    },
    onError: (e) => setError(errorText(e)),
  });
  const save = async (changes: Json): Promise<boolean> => {
    setError("");
    try {
      await m.mutateAsync(changes);
      return true;
    } catch {
      return false;
    }
  };
  return { save, saving: m.isPending, error, clearError: () => setError("") };
}

export function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card st-card" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {intro ? <p className="intro">{intro}</p> : null}
      {children}
    </section>
  );
}

export function Switch({
  checked,
  onChange,
  title,
  text,
  disabled,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  text?: ReactNode;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <label className="st-switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="track" aria-hidden="true" />
      <span className="state" aria-hidden="true">
        {checked ? "An" : "Aus"}
      </span>
      <span className="txt">
        <strong>{title}</strong>
        {text ? <span className="muted">{text}</span> : null}
      </span>
    </label>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return children ? (
    <p className="err" role="alert" style={{ margin: "0 0 0.75rem" }}>
      {children}
    </p>
  ) : null;
}

export function download(name: string, text: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Zeitstempel des Hintergrunddienstes (mit "Z", "+0200" oder ohne Zone) als Ortszeit. */
export function localTime(iso: string | null | undefined, seconds = false): string {
  if (!iso) return "–";
  const d = new Date(iso.replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: seconds ? "medium" : "short" });
}

/** Fragt Schlüssel oder Passwort erneut ab. onSubmit liefert einen Fehlertext oder nichts bei Erfolg. */
export function SecretModal({
  mode,
  title,
  intro,
  confirmLabel,
  danger,
  onSubmit,
  onClose,
}: {
  mode: string | null | undefined;
  title: string;
  intro: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onSubmit: (secret: string) => Promise<string | void>;
  onClose: () => void;
}) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const close = useStable(onClose);
  const isKey = mode !== "password";
  const go = async () => {
    setBusy(true);
    setError("");
    const msg = await onSubmit(secret);
    setBusy(false);
    if (msg) setError(msg);
  };
  return (
    <Modal
      title={title}
      onClose={close}
      actions={
        <>
          <button className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className={`btn ${danger ? "danger" : "primary"}`} disabled={!secret.trim() || busy} onClick={() => void go()}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (secret.trim() && !busy) void go();
        }}
      >
        <p style={{ marginTop: 0 }}>{intro}</p>
        <Field label={isKey ? "Wiederherstellungsschlüssel" : "Passwort"} htmlFor="st-secret">
          <input
            id="st-secret"
            type={isKey ? "text" : "password"}
            className={isKey ? "mono" : ""}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <FormError>{error}</FormError>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
