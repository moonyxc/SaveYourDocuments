import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorText, token, type Json } from "../../lib/api";
import { bytes } from "../../lib/format";
import { Badge, ErrorBox, PageHead, Spinner, useUi } from "../ui";
import { useCategories, useCompanies, useMeta, useTags } from "../documents/common";
import { EMPTY_FILTERS, FilterPanel, activeFilters, buildFilter, type Filters } from "../documents/filters";

type Template = { id: number; name: string; path_template: string; file_template: string; include_archived: boolean };
type PlanItem = { document_id: number; page: number; target: string; archived: boolean };
type RunResult = { files: number; bytes: number; destination: string };

const TOKENS: [string, string][] = [
  ["firma", "Firma"],
  ["bereich", "Bereich"],
  ["art", "Art"],
  ["jahr", "Jahr"],
  ["monat", "Monat"],
  ["datum", "Datum"],
  ["betrag", "Betrag"],
  ["name", "Originalname"],
  ["id", "Nummer"],
];
const SAMPLE: Record<string, string> = {
  firma: "Stadtwerke Beispiel",
  bereich: "Wohnen",
  art: "Rechnung",
  jahr: "2026",
  monat: "03",
  datum: "2026-03-14",
  betrag: "129,90EUR",
  name: "scan_0042",
  id: "42",
};
const DEFAULT_PATH = "{firma}/{jahr}";
const DEFAULT_FILE = "{datum}_{art}_{betrag}";

function renderExample(path: string, file: string): string {
  const fill = (t: string) => t.replace(/\{([a-z]+)\}/g, (_m, k: string) => SAMPLE[k] ?? "Unbekannt");
  const folder = path
    .split(/[/\\]/)
    .map((s) => fill(s).trim())
    .filter(Boolean);
  return [...folder, `${fill(file)}.pdf`].join("/");
}

/** Prueft die Vorlage, bevor der Server gefragt wird. Gibt eine verstaendliche Meldung oder "" zurueck. */
function templateError(path: string, file: string): string {
  const allowed = new Set(TOKENS.map(([t]) => t));
  for (const [label, t] of [
    ["Ordner", path],
    ["Dateiname", file],
  ] as const) {
    for (const m of t.matchAll(/\{([^}]*)\}/g)) {
      if (!allowed.has(m[1])) return `„{${m[1]}“ ist kein gültiger Platzhalter (${label}). Nutze die Schaltflächen unter dem Feld.`.replace("{" + m[1] + "“", "{" + m[1] + "}“");
    }
  }
  if (!file.trim()) return "Der Dateiname braucht eine Vorlage, zum Beispiel {datum}_{art}.";
  if (/^([A-Za-z]:|[/\\])/.test(path.trim()) || path.split(/[/\\]/).includes("..")) {
    return "Die Ordner-Vorlage ist relativ zum Ziel. Schreibe kein Laufwerk und kein „..“ hinein.";
  }
  return "";
}

const isAbsolutePath = (p: string) => /^([A-Za-z]:[\\/]|\\\\[^\\/]+[\\/]|\/)/.test(p.trim());

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function ExportView() {
  const { toast, confirm } = useUi();
  const qc = useQueryClient();
  const meta = useMeta();
  const companies = useCompanies();
  const categories = useCategories();
  const tags = useTags();
  const lookups = useMemo(
    () => ({ companies: companies.data ?? [], categories: categories.data ?? [], tags: tags.data ?? [] }),
    [companies.data, categories.data, tags.data],
  );

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [panel, setPanel] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [includeUnreviewed, setIncludeUnreviewed] = useState(false);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [pathT, setPathT] = useState(DEFAULT_PATH);
  const [fileT, setFileT] = useState(DEFAULT_FILE);
  const [saveName, setSaveName] = useState("");
  const [destination, setDestination] = useState("");
  const [destTouched, setDestTouched] = useState(false);
  const [busy, setBusy] = useState<"zip" | "folder" | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [failure, setFailure] = useState("");
  const lastField = useRef<"path" | "file">("file");
  const pathRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const templates = useQuery({
    queryKey: ["export", "templates"],
    queryFn: async () => (await api.get<{ items: Template[] }>("/api/export/templates")).items,
  });
  const initialised = useRef(false);
  useEffect(() => {
    const list = templates.data;
    if (!list || initialised.current) return;
    initialised.current = true;
    const t = list[0];
    if (t) {
      setTemplateId(t.id);
      setPathT(t.path_template);
      setFileT(t.file_template);
      setIncludeArchived(t.include_archived);
    }
  }, [templates.data]);

  const selected = templates.data?.find((t) => t.id === templateId) ?? null;
  const dirty = !!selected && (selected.path_template !== pathT || selected.file_template !== fileT || selected.include_archived !== includeArchived);

  const pickTemplate = (id: string) => {
    if (!id) {
      setTemplateId(null);
      return;
    }
    const t = templates.data?.find((x) => x.id === Number(id));
    if (!t) return;
    setTemplateId(t.id);
    setPathT(t.path_template);
    setFileT(t.file_template);
    setIncludeArchived(t.include_archived);
  };

  const insertToken = (tok: string) => {
    const field = lastField.current;
    const el = field === "path" ? pathRef.current : fileRef.current;
    const text = `{${tok}}`;
    const cur = field === "path" ? pathT : fileT;
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    const next = cur.slice(0, start) + text + cur.slice(end);
    if (field === "path") setPathT(next);
    else setFileT(next);
    window.requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const tplError = templateError(pathT, fileT);
  const { value: fv, errors } = buildFilter(filters);
  const filterBlocked = Object.keys(errors).length > 0;
  const body = useMemo(
    () => ({
      path_template: pathT,
      file_template: fileT,
      include_archived: includeArchived,
      include_unreviewed: includeUnreviewed,
      filters: fv,
    }),
    // fv wird bei jedem Rendern neu gebaut; der JSON-Schluessel haelt die Abhaengigkeit stabil
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathT, fileT, includeArchived, includeUnreviewed, JSON.stringify(fv)],
  );
  const debouncedBody = useDebounced(body, 350);
  const canPlan = !tplError && !filterBlocked;

  const plan = useQuery({
    queryKey: ["export", "plan", debouncedBody],
    queryFn: () => api.post<{ items: PlanItem[]; total: number }>("/api/export/plan", debouncedBody),
    enabled: canPlan,
    placeholderData: keepPreviousData,
  });
  const total = canPlan ? (plan.data?.total ?? 0) : 0;
  const documentsInPlan = new Set((plan.data?.items ?? []).map((i) => i.document_id)).size;
  const archivedInPlan = (plan.data?.items ?? []).filter((i) => i.archived).length;
  const waiting = canPlan && (plan.isFetching || debouncedBody !== body);
  const ready = canPlan && !plan.isError && !waiting && total > 0;

  const change = useCallback((patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch })), []);
  const chips = activeFilters(filters, lookups, false);
  const resetFilters = () => setFilters(EMPTY_FILTERS);

  const saveTemplate = async (asNew: boolean) => {
    const name = asNew ? saveName.trim() : (selected?.name ?? "");
    if (!name) {
      toast("Bitte gib der Vorlage einen Namen.", "bad");
      return;
    }
    try {
      const res = await api.post<{ id: number }>("/api/export/templates", {
        name,
        path_template: pathT,
        file_template: fileT,
        include_archived: includeArchived,
        id: asNew ? undefined : selected?.id,
      });
      await qc.invalidateQueries({ queryKey: ["export", "templates"] });
      setTemplateId(res.id);
      setSaveName("");
      toast(asNew ? "Vorlage gespeichert." : "Änderungen an der Vorlage gespeichert.");
    } catch (e) {
      toast(errorText(e), "bad");
    }
  };
  const deleteTemplate = async () => {
    if (!selected) return;
    const ok = await confirm({
      title: `Vorlage „${selected.name}“ löschen?`,
      text: "Bereits exportierte Dateien bleiben, wo sie sind.",
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/export/templates/${selected.id}`);
      const rest = (templates.data ?? []).filter((t) => t.id !== selected.id);
      setTemplateId(rest[0]?.id ?? null);
      if (rest[0]) {
        setPathT(rest[0].path_template);
        setFileT(rest[0].file_template);
        setIncludeArchived(rest[0].include_archived);
      }
      await qc.invalidateQueries({ queryKey: ["export", "templates"] });
      toast("Vorlage gelöscht.");
    } catch (e) {
      toast(errorText(e), "bad");
    }
  };

  const warning = (
    <>
      Die exportierten Dateien sind <strong>nicht verschlüsselt</strong>. Sie verlassen das geschützte Archiv und jeder, der Zugriff auf das Ziel hat, kann sie lesen.
    </>
  );

  const downloadZip = async () => {
    const ok = await confirm({
      title: `${total === 1 ? "1 Datei" : `${total} Dateien`} als ZIP herunterladen?`,
      text: warning,
      confirmLabel: "ZIP herunterladen",
    });
    if (!ok) return;
    setBusy("zip");
    setFailure("");
    setResult(null);
    try {
      let res: Response;
      try {
        res = await fetch("/api/export/download", {
          method: "POST",
          headers: { "X-SYD-Token": token(), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        throw new ApiError(0, { message: "Das Programm im Hintergrund antwortet nicht. Bitte starte Save Your Documents neu." });
      }
      if (!res.ok) {
        let data: Json = {};
        try {
          data = await res.json();
        } catch {
          /* keine lesbare Antwort */
        }
        throw new ApiError(res.status, data && typeof data === "object" ? data : {});
      }
      const blob = await res.blob();
      const name = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "dokumente.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast(`ZIP-Datei „${name}“ wurde heruntergeladen (${bytes(blob.size)}).`);
    } catch (e) {
      setFailure(e instanceof ApiError && e.message !== "Unbekannter Fehler" ? e.message : "Die ZIP-Datei konnte nicht erstellt werden. Versuche es noch einmal.");
    } finally {
      setBusy(null);
    }
  };

  const destError = !destination.trim() ? "Bitte gib den Zielordner an." : !isAbsolutePath(destination) ? "Der Zielordner muss ein vollständiger Pfad sein, zum Beispiel C:\\Export oder D:\\Backup\\Dokumente." : "";

  const copyToFolder = async () => {
    setDestTouched(true);
    if (destError) return;
    const ok = await confirm({
      title: `${total === 1 ? "1 Datei" : `${total} Dateien`} in den Ordner kopieren?`,
      text: (
        <>
          Ziel: <span className="mono">{destination.trim()}</span>
          <br />
          {warning}
        </>
      ),
      confirmLabel: "Jetzt kopieren",
    });
    if (!ok) return;
    setBusy("folder");
    setFailure("");
    setResult(null);
    try {
      const res = await api.post<RunResult>("/api/export/run", { ...body, destination: destination.trim() });
      setResult(res);
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  if (templates.isError) return <ErrorBox error={templates.error} retry={() => void templates.refetch()} />;

  return (
    <div>
      <PageHead
        title="Exportieren"
        lead="Kopiere ausgewählte Dokumente in übersichtliche Ordner, zum Beispiel für den Steuerberater. Dein Archiv bleibt dabei unverändert."
      />
      <div className="notice" role="note" style={{ marginBottom: "1rem" }}>
        <strong>Achtung:</strong> {warning}
      </div>

      <div className="dx-steps">
        <section className="card dx-step" aria-labelledby="ex-s1">
          <h2 id="ex-s1">Welche Dokumente?</h2>
          <div className="row wrap" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ margin: 0, flex: 1, minWidth: "14rem" }}>
              <label htmlFor="ex-q">Suchbegriff (optional)</label>
              <input id="ex-q" type="search" value={filters.q} placeholder="Firma, Betrag oder Stichwort" onChange={(e) => change({ q: e.target.value })} />
            </div>
            <button className="btn secondary" aria-expanded={panel} aria-controls="ex-filter" onClick={() => setPanel((p) => !p)}>
              {panel ? "Weitere Filter ausblenden" : "Weitere Filter"}
              {chips.filter((c) => c.key !== "q").length ? ` (${chips.filter((c) => c.key !== "q").length})` : ""}
            </button>
          </div>
          {panel ? (
            <div id="ex-filter" style={{ marginTop: "0.75rem" }}>
              <FilterPanel filters={filters} change={change} errors={errors} extended={false} docTypes={meta.data?.doc_types ?? []} lookups={lookups} />
            </div>
          ) : null}
          {chips.length ? (
            <div className="dx-active" style={{ marginTop: "0.75rem" }}>
              {chips.map((c) => (
                <button key={c.key} className="chip" onClick={() => setFilters(c.clear(filters))} aria-label={`Filter entfernen: ${c.label}`}>
                  {c.label} ×
                </button>
              ))}
              <button className="btn ghost small" onClick={resetFilters}>
                Alle Filter entfernen
              </button>
            </div>
          ) : (
            <p className="hint">Ohne Filter werden alle geprüften Dokumente exportiert.</p>
          )}
          {errors.amount_min || errors.amount_max || errors.date ? (
            <div className="hint err" role="alert">
              Bitte korrigiere die Filter, dann erscheint die Vorschau.
            </div>
          ) : null}
          <div className="stack" style={{ gap: "0.25rem", marginTop: "0.75rem" }}>
            <label className="row" style={{ minHeight: "2.75rem" }}>
              <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
              <span>Archivierte Dokumente mitnehmen</span>
            </label>
            <label className="row" style={{ minHeight: "2.75rem" }}>
              <input type="checkbox" checked={includeUnreviewed} onChange={(e) => setIncludeUnreviewed(e.target.checked)} />
              <span>Auch Dokumente mitnehmen, die noch nicht geprüft sind</span>
            </label>
          </div>
        </section>

        <section className="card dx-step" aria-labelledby="ex-s2">
          <h2 id="ex-s2">Wie sollen Ordner und Dateien heißen?</h2>
          {templates.isPending ? (
            <Spinner />
          ) : (
            <>
              <div className="field">
                <label htmlFor="ex-tpl">Gespeicherte Vorlage</label>
                <select id="ex-tpl" value={templateId ?? ""} onChange={(e) => pickTemplate(e.target.value)}>
                  <option value="">Eigene Eingabe</option>
                  {(templates.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="dx-grid">
                <div className="field">
                  <label htmlFor="ex-path">Ordner</label>
                  <input
                    id="ex-path"
                    ref={pathRef}
                    className="mono"
                    value={pathT}
                    spellCheck={false}
                    onFocus={() => (lastField.current = "path")}
                    onChange={(e) => setPathT(e.target.value)}
                  />
                  <div className="hint">Unterordner trennst du mit /. Leer lassen, wenn alles in einem Ordner liegen soll.</div>
                </div>
                <div className="field">
                  <label htmlFor="ex-file">Dateiname</label>
                  <input
                    id="ex-file"
                    ref={fileRef}
                    className="mono"
                    value={fileT}
                    spellCheck={false}
                    onFocus={() => (lastField.current = "file")}
                    onChange={(e) => setFileT(e.target.value)}
                  />
                  <div className="hint">Die Endung (zum Beispiel .pdf) kommt automatisch dazu.</div>
                </div>
              </div>
              <div role="group" aria-label="Platzhalter einfügen" className="chips">
                {TOKENS.map(([tok, label]) => (
                  <button key={tok} type="button" className="chip" onClick={() => insertToken(tok)} aria-label={`Platzhalter ${label} einfügen`}>
                    {label}
                  </button>
                ))}
              </div>
              {tplError ? (
                <div className="hint err" role="alert">
                  {tplError}
                </div>
              ) : (
                <div className="suggest" aria-live="polite">
                  <div className="muted">So sieht ein Beispiel aus:</div>
                  <div className="mono" style={{ overflowWrap: "anywhere", color: "var(--text-primary)" }}>
                    {renderExample(pathT, fileT)}
                  </div>
                </div>
              )}
              <div className="row wrap" style={{ alignItems: "flex-end" }}>
                {selected && dirty ? (
                  <button className="btn secondary" disabled={!!tplError} onClick={() => void saveTemplate(false)}>
                    Änderungen an „{selected.name}“ speichern
                  </button>
                ) : null}
                {selected && (templates.data?.length ?? 0) > 1 ? (
                  <button className="btn ghost" onClick={() => void deleteTemplate()}>
                    Vorlage „{selected.name}“ löschen
                  </button>
                ) : null}
              </div>
              <form
                className="row wrap"
                style={{ alignItems: "flex-end", marginTop: "0.75rem" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveTemplate(true);
                }}
              >
                <div className="field" style={{ margin: 0, flex: 1, minWidth: "12rem" }}>
                  <label htmlFor="ex-name">Als neue Vorlage speichern</label>
                  <input id="ex-name" value={saveName} maxLength={60} placeholder="Name, z. B. Steuerberater" onChange={(e) => setSaveName(e.target.value)} />
                </div>
                <button className="btn secondary" type="submit" disabled={!saveName.trim() || !!tplError}>
                  Speichern
                </button>
              </form>
            </>
          )}
        </section>

        <section className="card dx-step" aria-labelledby="ex-s3">
          <h2 id="ex-s3">Vorschau</h2>
          {!canPlan ? (
            <p className="muted">Sobald Filter und Vorlage stimmen, siehst du hier, was exportiert wird.</p>
          ) : plan.isError ? (
            <ErrorBox error={plan.error} retry={() => void plan.refetch()} />
          ) : plan.isPending ? (
            <Spinner label="Vorschau wird erstellt …" />
          ) : total === 0 ? (
            <div className="notice" role="status">
              <strong>Nichts zu exportieren.</strong> Mit diesen Filtern gibt es keine passenden Dokumente.
              {!includeUnreviewed ? " Dokumente, die noch nicht geprüft sind, werden nur mitgenommen, wenn du das oben anhakst." : ""} Lockere die Filter oder entferne sie.
            </div>
          ) : (
            <>
              <p role="status" aria-live="polite" style={{ marginTop: 0 }}>
                <strong>{total === 1 ? "1 Datei" : `${total} Dateien`}</strong> aus {documentsInPlan === 1 ? "1 Dokument" : `${documentsInPlan} Dokumenten`}
                {total > (plan.data?.items.length ?? 0) ? ` (die ersten ${plan.data?.items.length} siehst du unten)` : ""}
                {archivedInPlan ? <Badge tone="gray"> ▣ {archivedInPlan} aus dem Archiv</Badge> : null}
                {waiting ? <span className="muted"> · wird aktualisiert …</span> : null}
              </p>
              <div className="dx-path-list" role="region" aria-label="Vorschau der Dateien" tabIndex={0}>
                <ul className="list">
                  {(plan.data?.items ?? []).slice(0, 12).map((i) => (
                    <li key={`${i.document_id}-${i.page}`} className="item">
                      <span className="mono" style={{ overflowWrap: "anywhere", fontSize: "0.8125rem" }}>
                        {i.target}
                      </span>
                      {i.archived ? <Badge tone="gray">▣ Archiviert</Badge> : null}
                    </li>
                  ))}
                </ul>
              </div>
              {total > 12 ? <p className="hint">… und {total - 12} weitere.</p> : null}
            </>
          )}
        </section>

        <section className="card dx-step" aria-labelledby="ex-s4">
          <h2 id="ex-s4">Wohin?</h2>
          {failure ? (
            <div className="notice bad" role="alert">
              {failure}
            </div>
          ) : null}
          {result ? (
            <div className="notice good" role="status">
              <strong>
                {result.files === 1 ? "1 Datei" : `${result.files} Dateien`} kopiert ({bytes(result.bytes)}).
              </strong>
              <div>
                Ziel: <span className="mono">{result.destination}</span>
              </div>
              <div className="muted">Gab es eine Datei schon, wurde die neue mit einer Nummer ergänzt. Nichts wurde überschrieben.</div>
            </div>
          ) : null}
          <div className="dx-grid">
            <div className="card" style={{ background: "var(--bg-primary)" }}>
              <h3>ZIP-Datei herunterladen</h3>
              <p className="muted">Eine einzelne Datei mit allen Ordnern. Praktisch zum Weitergeben per E-Mail oder Stick.</p>
              <button className="btn primary" disabled={!ready || busy !== null} onClick={() => void downloadZip()}>
                {busy === "zip" ? "ZIP wird erstellt …" : "ZIP herunterladen"}
              </button>
            </div>
            <div className="card" style={{ background: "var(--bg-primary)" }}>
              <h3>In einen Ordner kopieren</h3>
              <div className="field">
                <label htmlFor="ex-dest">Zielordner</label>
                <input
                  id="ex-dest"
                  className="mono"
                  value={destination}
                  spellCheck={false}
                  placeholder="C:\Export\Steuer 2026"
                  aria-invalid={destTouched && !!destError}
                  aria-describedby="ex-dest-hint"
                  onChange={(e) => setDestination(e.target.value)}
                  onBlur={() => setDestTouched(true)}
                />
                <div id="ex-dest-hint" className={`hint ${destTouched && destError ? "err" : ""}`} role={destTouched && destError ? "alert" : undefined}>
                  {destTouched && destError ? destError : "Gib den vollständigen Pfad ein. Den Ordner legt das Programm an, falls es ihn noch nicht gibt."}
                </div>
              </div>
              <button className="btn primary" disabled={!ready || busy !== null} onClick={() => void copyToFolder()}>
                {busy === "folder" ? "Wird kopiert …" : "In den Ordner kopieren"}
              </button>
            </div>
          </div>
          {!ready && canPlan && !plan.isPending && total === 0 ? <p className="hint">Die Schaltflächen sind erst aktiv, wenn es etwas zu exportieren gibt.</p> : null}
        </section>
      </div>
    </div>
  );
}
