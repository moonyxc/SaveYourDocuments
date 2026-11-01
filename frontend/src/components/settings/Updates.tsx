import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText, type Json } from "../../lib/api";
import { Spinner, useUi } from "../ui";
import { localTime, Section, Switch, useSaveSettings, useSettings } from "./shared";

/** Automatische Suche: nur wenn eingeschaltet; das Backend fragt höchstens alle 12 Stunden bei GitHub nach. */
export function useAutoUpdateCheck() {
  const settings = useSettings();
  const on = settings.data?.update_check_auto === true;
  return useQuery({
    queryKey: ["updates", "auto"],
    queryFn: () => api.post<Json>("/api/updates/check", { auto: true }),
    enabled: on,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

export function UpdateNotice({ info }: { info: Json | undefined }) {
  const { toast } = useUi();
  if (info?.status !== "update") return null;
  return (
    <div className="notice" role="status">
      <div className="warn-item">
        <div>
          <strong>● Update verfügbar: </strong>
          Version {String(info.latest).replace(/^v/i, "")} ist erschienen. Du nutzt Version {info.current}.
        </div>
        <button
          className="btn secondary small"
          onClick={() => api.post("/api/updates/open").catch((e) => toast(errorText(e), "bad"))}
        >
          Release-Seite öffnen
        </button>
      </div>
    </div>
  );
}

function result(info: Json): { text: string; bad: boolean } {
  switch (info.status) {
    case "update":
      return {
        text: `Version ${String(info.latest).replace(/^v/i, "")} ist verfügbar${info.prerelease ? " (Vorabversion)" : ""}. Installiert wird nichts automatisch: Lade das neue Installationsprogramm von der Release-Seite und starte es.`,
        bad: false,
      };
    case "aktuell":
      return { text: "Du nutzt die neueste Version.", bad: false };
    case "kein_release":
      return { text: "Bei GitHub gibt es noch kein passendes Release.", bad: false };
    case "fehler":
      return { text: `Die Suche ist fehlgeschlagen. ${info.message ?? ""}`.trim(), bad: true };
    default:
      return { text: "", bad: false };
  }
}

export function UpdateSection({ version }: { version: string }) {
  const qc = useQueryClient();
  const { toast } = useUi();
  const settings = useSettings();
  const { save, saving } = useSaveSettings();
  const last = useQuery({ queryKey: ["updates", "last"], queryFn: () => api.get<Json>("/api/updates") });
  const run = useMutation({
    mutationFn: () => api.post<Json>("/api/updates/check", {}),
    onSuccess: (data) => {
      qc.setQueryData(["updates", "last"], data);
      void qc.invalidateQueries({ queryKey: ["updates", "auto"] });
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  const info = (run.data ?? last.data) as Json | undefined;
  const shown = info && info.status !== "nicht_geprueft" ? result(info) : null;
  return (
    <Section
      id="st-update"
      title="Updates"
      intro="Das Programm kann bei GitHub nachsehen, ob eine neuere Version erschienen ist. Dabei wird nur die öffentliche Liste der Versionen abgerufen. Es werden keine Daten aus deinem Archiv gesendet."
    >
      <dl className="st-kv">
        <dt>Installierte Version</dt>
        <dd className="mono">{version}</dd>
        <dt>Zuletzt geprüft</dt>
        <dd data-testid="update-checked">{info?.checked_at ? localTime(info.checked_at) : "Noch nicht"}</dd>
      </dl>
      <div className="actions" style={{ marginBottom: "1rem" }}>
        <button className="btn primary" onClick={() => run.mutate()} disabled={run.isPending} data-testid="update-check">
          Jetzt nach Updates suchen
        </button>
        {run.isPending ? <Spinner label="Suche läuft …" /> : null}
      </div>
      {shown ? (
        <div className={`notice ${shown.bad ? "bad" : ""}`} role={shown.bad ? "alert" : "status"} data-testid="update-result">
          {shown.text}
          {info?.status === "update" ? (
            <div style={{ marginTop: ".5rem" }}>
              <UpdateNoticeButton />
            </div>
          ) : null}
        </div>
      ) : null}
      {settings.data ? (
        <Switch
          checked={settings.data.update_check_auto === true}
          disabled={saving}
          onChange={(v) => void save({ update_check_auto: v })}
          title="Automatisch nach Updates suchen"
          text="Beim Öffnen der Startseite fragt das Programm höchstens alle 12 Stunden bei GitHub nach und weist dich auf neue Versionen hin."
          testId="update-auto"
        />
      ) : null}
    </Section>
  );
}

function UpdateNoticeButton() {
  const { toast } = useUi();
  return (
    <button className="btn secondary small" onClick={() => api.post("/api/updates/open").catch((e) => toast(errorText(e), "bad"))}>
      Release-Seite öffnen
    </button>
  );
}
