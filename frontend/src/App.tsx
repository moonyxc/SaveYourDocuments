import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText, type Json } from "./lib/api";
import { useEvent, useLiveEvents } from "./lib/events";
import { useApplyDisplaySettings } from "./lib/display";
import { NavContext, type NavParams, type View } from "./lib/nav";
import { Icon, Spinner, useUi } from "./components/ui";
import { Setup, Unlock } from "./views/Gate";

const Dashboard = lazy(() => import("./views/Dashboard"));
const Import = lazy(() => import("./views/Import"));
const Review = lazy(() => import("./views/Review"));
const Documents = lazy(() => import("./views/Documents"));
const Deadlines = lazy(() => import("./views/Deadlines"));
const Stats = lazy(() => import("./views/Stats"));
const Export = lazy(() => import("./views/Export"));
const Settings = lazy(() => import("./views/Settings"));

const NAV: { id: View; label: string; icon: string; sep?: boolean }[] = [
  { id: "start", label: "Start", icon: "start" },
  { id: "import", label: "Fotos sortieren", icon: "import" },
  { id: "review", label: "Prüfen", icon: "review" },
  { id: "docs", label: "Dokumente", icon: "docs" },
  { id: "fristen", label: "Fristen", icon: "fristen" },
  { id: "stats", label: "Auswertung", icon: "stats" },
  { id: "export", label: "Exportieren", icon: "export" },
  { id: "settings", label: "Einstellungen", icon: "settings", sep: true },
];

function Shell({ mode }: { mode: string | null }) {
  useApplyDisplaySettings();
  const qc = useQueryClient();
  const { toast } = useUi();
  const [view, setView] = useState<View>("start");
  const [params, setParams] = useState<NavParams>({});
  const [q, setQ] = useState("");
  const [live, setLive] = useState(true);

  const go = useCallback((v: View, p: NavParams = {}) => {
    setView(v);
    setParams(p);
    window.scrollTo(0, 0);
  }, []);
  const nav = useMemo(() => ({ view, params, go }), [view, params, go]);

  useLiveEvents(true, setLive);
  useEvent((e) => {
    if (e.type === "backup.failed") toast("Die automatische Sicherung ist fehlgeschlagen.", "bad");
    if (e.type === "integrity.failed") toast("Die Prüfung des Archivs hat einen Fehler gefunden.", "bad");
    if (e.type === "locked") void qc.invalidateQueries({ queryKey: ["status"] });
  });

  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Json>("/api/dashboard") });
  const incoming = useQuery({ queryKey: ["incoming"], queryFn: () => api.get<Json>("/api/incoming") });
  const lock = useMutation({
    mutationFn: () => api.post("/api/lock"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["status"] }),
    onError: (e) => toast(errorText(e), "bad"),
  });

  const counts: Partial<Record<View, number>> = {
    import: (dash.data?.waiting_files ?? 0) + (incoming.data?.items?.length ?? 0),
    review: dash.data?.to_review ?? 0,
    fristen: dash.data?.upcoming?.filter((d: Json) => !d.done).length ?? 0,
  };
  const ls = incoming.data?.status;
  const dotClass = !live ? "bad" : ls?.running ? "" : "warn";
  const pill = !live
    ? "Keine Verbindung zum Hintergrunddienst"
    : ls?.running
      ? `Empfangsbereit · „${ls.alias}“`
      : ls?.enabled
        ? "Empfang vom Handy blockiert"
        : "Empfang vom Handy ist aus";

  return (
    <NavContext.Provider value={nav}>
      <div className="app">
        <header>
          <div className="brand">Save Your Documents</div>
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              go("docs", { q });
            }}
          >
            <Icon name="search" />
            <label className="sr" htmlFor="q">
              Dokumente durchsuchen
            </label>
            <input
              id="q"
              type="search"
              placeholder="Firma, Betrag oder Stichwort suchen"
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>
          <div className="status-pill" title="Das Programm läuft im Hintergrund und empfängt Dokumente vom Handy">
            <span className={`dot ${dotClass}`} />
            <span>{pill}</span>
          </div>
          {mode === "password" ? (
            <button className="btn ghost small" onClick={() => lock.mutate()} title="Archiv sperren">
              <Icon name="lock" className="" />
              Sperren
            </button>
          ) : null}
        </header>

        <nav aria-label="Hauptmenü">
          {NAV.map((n) => (
            <div key={n.id}>
              {n.sep ? <div className="sep" /> : null}
              <button aria-current={view === n.id ? "page" : undefined} onClick={() => go(n.id)}>
                <Icon name={n.icon} />
                {n.label}
                {counts[n.id] ? <span className="count">{counts[n.id]}</span> : null}
              </button>
            </div>
          ))}
        </nav>

        <main>
          <Suspense fallback={<Spinner />}>
            {view === "start" && <Dashboard />}
            {view === "import" && <Import />}
            {view === "review" && <Review />}
            {view === "docs" && <Documents />}
            {view === "fristen" && <Deadlines />}
            {view === "stats" && <Stats />}
            {view === "export" && <Export />}
            {view === "settings" && <Settings />}
          </Suspense>
        </main>
      </div>
    </NavContext.Provider>
  );
}

export default function App() {
  const status = useQuery({
    queryKey: ["status"],
    queryFn: () => api.get<Json>("/api/status"),
    refetchInterval: (q) => (q.state.data?.state === "ready" ? false : 4000),
    retry: 1,
  });

  if (status.isPending) {
    return (
      <div style={{ padding: "3rem" }}>
        <Spinner label="Das Programm startet …" />
      </div>
    );
  }
  if (status.isError) {
    const unauth = (status.error as { status?: number }).status === 401;
    return (
      <main style={{ maxWidth: "32rem", margin: "0 auto", padding: "3rem 1.25rem" }}>
        <h1>{unauth ? "Zugriff verweigert" : "Keine Verbindung"}</h1>
        <p className="lead">
          {unauth
            ? "Öffne Save Your Documents über die Programmverknüpfung oder das Tray-Symbol. Dieser Link ist abgelaufen."
            : errorText(status.error)}
        </p>
        <button className="btn primary" onClick={() => void status.refetch()}>
          Noch einmal versuchen
        </button>
      </main>
    );
  }
  const s = status.data as Json;
  if (s.state === "setup") return <Setup status={s} />;
  if (s.state === "locked") return <Unlock status={s} />;
  return <Shell mode={s.mode} />;
}
