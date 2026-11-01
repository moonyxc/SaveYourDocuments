import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText, type Json } from "../../lib/api";
import { Badge, ErrorBox, Field, Spinner, useUi } from "../ui";
import { FormError, localTime, Section, Switch, useSaveSettings, useSystem } from "./shared";

function portHint(error: string | null | undefined, port: number): string {
  if (error === "port_belegt")
    return `Der Anschluss ${port} wird schon von einem anderen Programm benutzt. Schließe das andere Programm oder starte den Computer neu, dann versucht es Save Your Documents noch einmal.`;
  return "Der Empfang konnte nicht starten. Beende Save Your Documents über das Symbol im Infobereich der Taskleiste und öffne es dann neu.";
}

function ReceiveCard({ settings }: { settings: Json }) {
  const sys = useSystem();
  const { save, error } = useSaveSettings();
  const ls = sys.data?.localsend;
  const enabled: boolean = settings.localsend_enabled;
  return (
    <Section
      id="st-recv"
      title="Empfang vom Handy"
      intro="Mit der kostenlosen App LocalSend schickst du Fotos direkt vom Handy an diesen Computer. Alles bleibt im eigenen WLAN."
    >
      <div className="row wrap spread" style={{ marginBottom: ".5rem" }}>
        <Switch
          checked={enabled}
          onChange={(v) => void save({ localsend_enabled: v })}
          title="Fotos vom Handy empfangen"
          text="Aus: Das Handy findet diesen Computer nicht."
          testId="sw-localsend"
        />
        {ls ? (
          ls.running ? (
            <Badge tone="green">✓ Empfangsbereit</Badge>
          ) : enabled ? (
            <Badge tone="red">✕ Blockiert</Badge>
          ) : (
            <Badge tone="gray">Aus</Badge>
          )
        ) : null}
      </div>
      {ls && enabled && !ls.running ? (
        <div className="notice bad" role="alert" style={{ marginBottom: "1rem" }}>
          {portHint(ls.error, ls.port)}
        </div>
      ) : null}
      {ls?.running ? (
        <p className="hint" style={{ marginTop: 0 }}>
          LocalSend-Adresse für „{ls.alias}“:{" "}
          <span className="mono">
            {ls.ip ? `${ls.ip}:${ls.port}` : `IP nicht ermittelbar (Anschluss ${ls.port})`}
          </span>.
        </p>
      ) : null}
      <FormError>{error}</FormError>
    </Section>
  );
}

function AliasCard({ settings }: { settings: Json }) {
  const { save, saving, error, clearError } = useSaveSettings();
  const [alias, setAlias] = useState<string>(settings.localsend_alias);
  const [maxMb, setMaxMb] = useState<string>(String(settings.max_file_mb));
  const dirty = alias !== settings.localsend_alias || maxMb !== String(settings.max_file_mb);
  const submit = () => {
    if (!alias.trim()) return;
    void save({ localsend_alias: alias.trim(), max_file_mb: maxMb.trim() ? Number(maxMb) : null });
  };
  return (
    <Section id="st-alias" title="Gerätename und Dateigröße">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Name dieses Computers im Handy" htmlFor="st-alias-in" hint="So taucht der Computer in der Geräteliste von LocalSend auf.">
          <input
            id="st-alias-in"
            value={alias}
            maxLength={60}
            onChange={(e) => {
              setAlias(e.target.value);
              clearError();
            }}
          />
        </Field>
        <Field label="Größte erlaubte Datei (Megabyte)" htmlFor="st-maxmb" hint="Größere Dateien werden abgelehnt. Erlaubt sind 1 bis 1000.">
          <input
            id="st-maxmb"
            type="number"
            min={1}
            max={1000}
            inputMode="numeric"
            value={maxMb}
            style={{ maxWidth: "10rem" }}
            onChange={(e) => {
              setMaxMb(e.target.value);
              clearError();
            }}
          />
        </Field>
        <FormError>{error}</FormError>
        <button className="btn primary" type="submit" disabled={!dirty || saving || !alias.trim()}>
          Speichern
        </button>
      </form>
    </Section>
  );
}

function PinCard({ settings }: { settings: Json }) {
  const { confirm } = useUi();
  const { save, saving, error, clearError } = useSaveSettings();
  const [pin, setPin] = useState("");
  const [local, setLocal] = useState("");
  const pinSet = Boolean(settings.localsend_pin);
  const submit = async () => {
    if (!/^\d{4,8}$/.test(pin)) {
      setLocal("Die PIN besteht aus 4 bis 8 Ziffern.");
      return;
    }
    setLocal("");
    if (await save({ localsend_pin: pin })) setPin("");
  };
  const clear = async () => {
    const ok = await confirm({
      title: "PIN entfernen?",
      text: "Danach kann jedes Gerät im WLAN eine Anfrage schicken. Du musst sie weiterhin selbst annehmen.",
      confirmLabel: "PIN entfernen",
      danger: true,
    });
    if (ok) void save({ localsend_pin: null });
  };
  return (
    <Section
      id="st-pin"
      title="PIN"
      intro="Mit einer PIN können nur Geräte senden, die sie kennen. Das Handy fragt dann danach."
    >
      <p>{pinSet ? <Badge tone="green">✓ PIN gesetzt</Badge> : <Badge tone="gray">Keine PIN</Badge>}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={pinSet ? "Neue PIN" : "PIN festlegen"} htmlFor="st-pin-in" hint="4 bis 8 Ziffern.">
          <input
            id="st-pin-in"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={pin}
            style={{ maxWidth: "12rem" }}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setLocal("");
              clearError();
            }}
          />
        </Field>
        <FormError>{local || error}</FormError>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={!pin || saving}>
            {pinSet ? "PIN ändern" : "PIN setzen"}
          </button>
          {pinSet ? (
            <button className="btn secondary" type="button" onClick={() => void clear()} disabled={saving}>
              PIN entfernen
            </button>
          ) : null}
        </div>
      </form>
    </Section>
  );
}

function TrustedCard({ settings }: { settings: Json }) {
  const qc = useQueryClient();
  const { toast, confirm } = useUi();
  const { save, error } = useSaveSettings();
  const trusted = useQuery({ queryKey: ["trusted"], queryFn: () => api.get<Json>("/api/trusted-devices") });
  const revoke = useMutation({
    mutationFn: (id: number) => api.del(`/api/trusted-devices/${id}`),
    onSuccess: () => {
      toast("Gerät entfernt");
      void qc.invalidateQueries({ queryKey: ["trusted"] });
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  const items: Json[] = trusted.data?.items ?? [];
  const ask = async (d: Json) => {
    const ok = await confirm({
      title: `„${d.alias}“ nicht mehr vertrauen?`,
      text: "Dieses Gerät wird beim nächsten Senden wieder gefragt, ob es senden darf. Bereits empfangene Dokumente bleiben erhalten.",
      confirmLabel: "Gerät entfernen",
      danger: true,
    });
    if (ok) revoke.mutate(d.id);
  };
  return (
    <Section
      id="st-trust"
      title="Bekannte Geräte"
      intro="Geräte, denen du beim Annehmen vertraut hast. Weil sich im WLAN jedes Gerät mit beliebigem Namen melden kann, erkennt das Programm Geräte an ihrem Fingerabdruck, nicht am Namen."
    >
      <Switch
        checked={settings.localsend_auto_accept}
        onChange={(v) => void save({ localsend_auto_accept: v })}
        title="Bekannte Geräte automatisch annehmen"
        text="An: Fotos von Geräten in dieser Liste kommen ohne Rückfrage an. Unbekannte Geräte fragen immer nach."
        testId="sw-auto-accept"
      />
      <FormError>{error}</FormError>
      <hr className="st-divider" />
      {trusted.isPending ? (
        <Spinner />
      ) : trusted.isError ? (
        <ErrorBox error={trusted.error} retry={() => void trusted.refetch()} />
      ) : items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Noch kein Gerät als bekannt gespeichert. Beim Annehmen von Fotos kannst du „Diesem Gerät vertrauen“ wählen.
        </p>
      ) : (
        <ul className="list" aria-label="Bekannte Geräte">
          {items.map((d) => (
            <li key={d.id} className="item">
              <div className="grow">
                <strong>{d.alias}</strong>
                <div className="muted" style={{ fontSize: ".875rem" }}>
                  Vertraut seit {localTime(d.trusted_since)}
                </div>
              </div>
              <button className="btn secondary small" onClick={() => void ask(d)} aria-label={`${d.alias} entfernen`}>
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function FirewallCard() {
  const qc = useQueryClient();
  const { toast, confirm } = useUi();
  const fw = useQuery({ queryKey: ["firewall"], queryFn: () => api.get<Json>("/api/firewall") });
  const allow = useMutation({
    mutationFn: () => api.post<Json>("/api/firewall/allow"),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["firewall"] });
      if (r.ok) toast("Firewall-Regel angelegt");
      else toast("Die Regel wurde nicht angelegt. Hast du im Windows-Fenster „Nein“ gewählt? Versuche es noch einmal.", "bad");
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  const ask = async () => {
    const ok = await confirm({
      title: "Firewall-Regel anlegen?",
      text: "Windows zeigt gleich ein Fenster „Benutzerkontensteuerung“ und fragt, ob Änderungen erlaubt sind. Wähle „Ja“. Die Regel erlaubt nur Verbindungen aus deinem privaten Heimnetz zu diesem Programm, nicht aus dem Internet.",
      confirmLabel: "Weiter",
    });
    if (ok) allow.mutate();
  };
  const d = fw.data;
  return (
    <Section
      id="st-fw"
      title="Windows-Firewall"
      intro="Damit das Handy diesen Computer erreicht, muss die Windows-Firewall den Empfang erlauben."
    >
      {fw.isPending ? (
        <Spinner />
      ) : fw.isError ? (
        <ErrorBox error={fw.error} retry={() => void fw.refetch()} />
      ) : !d.supported ? (
        <p style={{ margin: 0 }}>
          <Badge tone="gray">Nicht nötig</Badge>
          <span style={{ marginLeft: ".5rem" }} className="muted">
            Die Firewall-Regel gibt es nur unter Windows. Auf diesem Computer ist nichts einzustellen.
          </span>
        </p>
      ) : (
        <>
          <p>
            {d.rule === true ? (
              <Badge tone="green">✓ Regel vorhanden</Badge>
            ) : d.rule === false ? (
              <Badge tone="yellow">! Regel fehlt</Badge>
            ) : (
              <Badge tone="gray">Status unbekannt</Badge>
            )}
            <span className="muted" style={{ marginLeft: ".5rem" }}>
              Anschluss <span className="mono">{d.port}</span>, nur privates Netzwerk
            </span>
          </p>
          <div className="actions">
            <button className="btn primary" disabled={allow.isPending || d.rule === true} onClick={() => void ask()}>
              Firewall-Regel anlegen
            </button>
            {allow.isPending ? <Spinner label="Warte auf die Bestätigung in Windows …" /> : null}
          </div>
        </>
      )}
    </Section>
  );
}

function HowToCard() {
  const sys = useSystem();
  const alias: string = sys.data?.localsend?.alias ?? "Save Your Documents";
  return (
    <Section id="st-how" title="So schickst du Fotos vom Handy">
      <ol className="st-steps">
        <li>Handy und Computer müssen im selben WLAN sein. Ein Gästenetz trennt Geräte oft voneinander und funktioniert deshalb meist nicht.</li>
        <li>Installiere auf dem Handy die kostenlose App „LocalSend“ und öffne sie.</li>
        <li>Wähle in der App „Dateien“ oder „Medien“ und suche die Fotos oder PDFs der Dokumente aus.</li>
        <li>
          Tippe in der Geräteliste auf „<strong style={{ color: "var(--text-primary)" }}>{alias}</strong>“.
        </li>
        <li>Auf dem Computer erscheint eine Anfrage. Nimm sie an, danach findest du die Fotos unter „Fotos sortieren“.</li>
      </ol>
      <p className="hint">
        Das Handy findet den Computer nicht? Prüfe, ob der Empfang oben an ist, die Firewall-Regel vorhanden ist und
        Save Your Documents läuft. Das Programm bleibt aktiv, wenn du das Fenster schließt. Du erkennst es am Symbol im
        Infobereich der Taskleiste und kannst es dort über das Menü beenden.
      </p>
    </Section>
  );
}

export function ReceiveTab({ settings }: { settings: Json }) {
  return (
    <>
      <ReceiveCard settings={settings} />
      <AliasCard settings={settings} />
      <PinCard settings={settings} />
      <TrustedCard settings={settings} />
      <FirewallCard />
      <HowToCard />
    </>
  );
}
