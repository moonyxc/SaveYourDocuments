import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorText } from "../../lib/api";
import { bytes } from "../../lib/format";
import { Badge, useUi } from "../ui";

export type IncomingRequest = {
  id: string;
  device: { alias: string; fingerprint: string; ip?: string };
  trusted: boolean;
  files: { id: string; name: string; size: number; mime: string }[];
  received_at: string;
};

export type ReceiverStatus = {
  enabled: boolean;
  running: boolean;
  error: string | null;
  port: number;
  alias: string;
  pin_set: boolean;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function Request({ req }: { req: IncomingRequest }) {
  const qc = useQueryClient();
  const { toast } = useUi();
  const total = req.files.reduce((s, f) => s + f.size, 0);

  const decide = useMutation({
    mutationFn: (v: { accept: boolean; trust: boolean }) => api.post(`/api/incoming/${req.id}/decide`, v),
    onSuccess: (_d, v) => {
      toast(
        v.accept
          ? "Angenommen. Die Dateien erscheinen gleich unten zum Sortieren."
          : "Abgelehnt. Es wurde nichts gespeichert.",
      );
      void qc.invalidateQueries({ queryKey: ["incoming"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "nicht_gefunden") {
        toast("Die Anfrage ist nicht mehr offen. Das Gerät hat sie vermutlich abgebrochen.", "bad");
        void qc.invalidateQueries({ queryKey: ["incoming"] });
      } else {
        toast(errorText(e), "bad");
      }
    },
  });
  const busy = decide.isPending;

  return (
    <section className="imp-incoming" aria-label={`Anfrage von ${req.device.alias}`}>
      <div className="row spread wrap">
        <h2 style={{ margin: 0 }}>
          „{req.device.alias}“ möchte {req.files.length} {plural(req.files.length, "Datei", "Dateien")} senden
        </h2>
        {req.trusted ? <Badge tone="green">✓ Gerät vertraut</Badge> : <Badge tone="yellow">▲ Gerät unbekannt</Badge>}
      </div>
      <p className="muted" style={{ margin: "0.25rem 0 0" }}>
        Zusammen {bytes(total)}
        {req.device.ip ? <> · Netzwerkadresse <span className="mono">{req.device.ip}</span></> : null}
      </p>
      <ul className="imp-files" aria-label="Dateien dieser Anfrage">
        {req.files.slice(0, 5).map((f) => (
          <li key={f.id}>
            {f.name} <span className="mono">({bytes(f.size)})</span>
          </li>
        ))}
        {req.files.length > 5 ? <li>und {req.files.length - 5} weitere</li> : null}
      </ul>
      {!req.trusted ? (
        <p className="hint">Nimm nur Dateien von Geräten an, die du kennst. Der Name eines Geräts lässt sich im Netzwerk vortäuschen.</p>
      ) : null}
      <div className="imp-actions">
        <button className="btn primary" disabled={busy} onClick={() => decide.mutate({ accept: true, trust: false })}>
          Annehmen
        </button>
        {!req.trusted ? (
          <button className="btn secondary" disabled={busy} onClick={() => decide.mutate({ accept: true, trust: true })}>
            Annehmen und Gerät vertrauen
          </button>
        ) : null}
        <button className="btn ghost" disabled={busy} onClick={() => decide.mutate({ accept: false, trust: false })}>
          Ablehnen
        </button>
      </div>
    </section>
  );
}

export function IncomingRequests({ items }: { items: IncomingRequest[] }) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: "1.5rem" }} role="region" aria-label="Eingehende Anfragen vom Handy" aria-live="polite">
      {items.map((r) => (
        <Request key={r.id} req={r} />
      ))}
    </div>
  );
}

/** Zeigt, ob der Empfang vom Handy bereit ist, und was bei Problemen zu tun ist. */
export function ReceiverCard({
  status,
  firewall,
  onSettings,
}: {
  status: ReceiverStatus | undefined;
  firewall: { supported: boolean; rule: boolean | null; port: number } | undefined;
  onSettings: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useUi();
  const allow = useMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/api/firewall/allow"),
    onSuccess: (r) => {
      if (r.ok) toast("Die Freigabe wurde eingerichtet. Das Handy kann jetzt senden.");
      else toast("Die Freigabe wurde nicht erteilt. Bestätige die Windows-Abfrage mit „Ja“ und versuche es noch einmal.", "bad");
      void qc.invalidateQueries({ queryKey: ["firewall"] });
    },
    onError: (e) => toast(errorText(e), "bad"),
  });

  if (!status) return null;
  const needsFirewall = firewall?.supported && firewall.rule === false;

  let body;
  if (!status.enabled) {
    body = (
      <div className="notice">
        <strong>Der Empfang vom Handy ist ausgeschaltet.</strong>
        <p style={{ margin: "0.25rem 0 0.75rem" }}>Schalte ihn in den Einstellungen ein, um Fotos per LocalSend zu bekommen.</p>
        <button className="btn secondary" onClick={onSettings}>
          Zu den Einstellungen
        </button>
      </div>
    );
  } else if (!status.running) {
    body = (
      <div className="notice bad" role="alert">
        <strong>▲ Der Empfang vom Handy ist blockiert.</strong>
        {status.error === "port_belegt" ? (
          <p style={{ margin: "0.25rem 0 0" }}>
            Ein anderes Programm benutzt den Anschluss {status.port}. Meist ist das die LocalSend-App auf diesem Computer.
            Schließe sie und starte Save Your Documents neu. Du kannst Fotos solange hier hineinziehen.
          </p>
        ) : (
          <p style={{ margin: "0.25rem 0 0" }}>
            Der Empfang konnte nicht gestartet werden. Starte Save Your Documents neu. Wenn das nicht hilft, kannst du Fotos
            solange hier hineinziehen.
          </p>
        )}
      </div>
    );
  } else {
    body = (
      <p style={{ margin: 0 }}>
        <span className="badge b-green">✓ Empfangsbereit</span>{" "}
        <span>
          Wähle in der LocalSend-App auf dem Handy „<strong style={{ color: "var(--text-primary)" }}>{status.alias}</strong>“ als Empfänger.
          {status.pin_set ? " Das Handy fragt nach der PIN aus den Einstellungen." : ""}
        </span>
      </p>
    );
  }

  return (
    <div className="card stack" style={{ gap: "0.75rem" }}>
      <h2 style={{ margin: 0 }}>Fotos vom Handy empfangen</h2>
      {body}
      {needsFirewall ? (
        <div className="notice">
          <strong>Die Windows-Firewall blockiert den Empfang vermutlich.</strong>
          <p style={{ margin: "0.25rem 0 0.75rem" }}>
            Erlaube Save Your Documents einmalig den Zugriff im Heimnetz (Anschluss {firewall.port}). Windows fragt dafür nach
            Administratorrechten.
          </p>
          <button className="btn primary" disabled={allow.isPending} onClick={() => allow.mutate()}>
            {allow.isPending ? "Bitte in Windows bestätigen …" : "Im Heimnetz erlauben"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
