import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText, type Json } from "../../lib/api";
import { date, eur } from "../../lib/format";
import { useNav } from "../../lib/nav";
import { Empty, ErrorBox, Icon, Modal, PageHead, Spinner, useUi } from "../ui";
import {
  StatusBadges,
  TagBadge,
  useCategories,
  useCompanies,
  useMeta,
  useOpenDeadlines,
  useTags,
  type Tag,
} from "./common";
import { EMPTY_FILTERS, FilterPanel, SORTS, activeFilters, buildFilter, type Filters } from "./filters";
import { NewTagForm } from "./tags";
import DocumentDetail from "./DocumentDetail";
import Manager from "./Manager";

const PAGE_SIZES = [25, 50, 100];

export default function DocumentsView() {
  const { params, go } = useNav();
  const qc = useQueryClient();
  const { toast, confirm } = useUi();

  const [filters, setFilters] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    q: params.q ?? "",
    archived: params.archived ?? "nein",
  }));
  const [qText, setQText] = useState(params.q ?? "");
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(25);
  const [panel, setPanel] = useState(false);
  const [manager, setManager] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulk, setBulk] = useState<"tag" | "archive" | null>(null);

  const change = useCallback((patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setOffset(0);
    setSelected(new Set());
  }, []);

  // Suche aus der Kopfzeile oder Verweis von anderen Ansichten
  useEffect(() => {
    if (params.q === undefined && params.archived === undefined) return;
    setFilters((f) => ({ ...f, q: params.q ?? f.q, archived: params.archived ?? f.archived }));
    if (params.q !== undefined) setQText(params.q);
    setOffset(0);
    setSelected(new Set());
  }, [params]);

  useEffect(() => {
    if (qText === filters.q) return;
    const t = window.setTimeout(() => change({ q: qText }), 300);
    return () => window.clearTimeout(t);
  }, [qText, filters.q, change]);

  const meta = useMeta();
  const companies = useCompanies();
  const categories = useCategories();
  const tags = useTags();
  const deadlines = useOpenDeadlines();
  const lookups = useMemo(
    () => ({ companies: companies.data ?? [], categories: categories.data ?? [], tags: tags.data ?? [] }),
    [companies.data, categories.data, tags.data],
  );

  const { value: fv, errors } = buildFilter(filters);
  const apiParams = { ...fv, state: filters.state, archived: filters.archived, sort: filters.sort, limit, offset };
  const list = useQuery({
    queryKey: ["documents", apiParams],
    queryFn: () => api.get<{ items: Json[]; total: number }>("/api/documents", apiParams),
    placeholderData: keepPreviousData,
    enabled: !params.doc,
  });
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  useEffect(() => {
    if (list.data && list.data.items.length === 0 && offset > 0) setOffset(Math.max(0, (Math.ceil(list.data.total / limit) - 1) * limit));
  }, [list.data, offset, limit]);

  if (params.doc) return <DocumentDetail id={params.doc} onBack={() => go("docs", {})} />;

  const chips = activeFilters(filters, lookups, true);
  const hasFilters = chips.length > 0;
  const filterCount = chips.filter((c) => c.key !== "q").length;
  const resetAll = () => {
    setQText("");
    change({ ...EMPTY_FILTERS, sort: filters.sort });
  };

  const open = (id: number) => go("docs", { doc: id });
  const allSelected = items.length > 0 && items.every((d) => selected.has(d.id));
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const chosen = items.filter((d) => selected.has(d.id));

  const sortBy = (a: string, b: string) => change({ sort: filters.sort === a ? b : a });
  const sortMark = (a: string, b: string) => (filters.sort === a ? " ↓" : filters.sort === b ? " ↑" : "");
  const ariaSort = (a: string, b: string) => (filters.sort === a ? "descending" : filters.sort === b ? "ascending" : "none");

  const restoreSelected = async () => {
    const ok = await confirm({
      title: chosen.length === 1 ? "Dokument wiederherstellen?" : `${chosen.length} Dokumente wiederherstellen?`,
      text: "Sie erscheinen danach wieder in der normalen Liste.",
      confirmLabel: "Wiederherstellen",
    });
    if (!ok) return;
    let failed = 0;
    for (const d of chosen.filter((x) => x.archived)) {
      try {
        await api.post(`/api/documents/${d.id}/restore`);
      } catch {
        failed++;
      }
    }
    setSelected(new Set());
    void qc.invalidateQueries({ queryKey: ["documents"] });
    toast(failed ? `${failed} Dokumente konnten nicht wiederhergestellt werden.` : "Wiederhergestellt.", failed ? "bad" : "ok");
  };

  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + limit, total);

  return (
    <>
      <PageHead
        title="Alle Dokumente"
        lead={list.data ? (total === 1 ? "1 Dokument" : `${total} Dokumente`) + (hasFilters ? " passen zu deiner Auswahl." : " im Archiv.") : "Dokumente werden geladen …"}
        actions={
          <button className="btn secondary" onClick={() => setManager(true)}>
            Firmen, Bereiche und Tags verwalten
          </button>
        }
      />

      <div className="dx-toolbar">
        <form
          className="dx-search grow"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            change({ q: qText });
          }}
        >
          <Icon name="search" />
          <label className="sr" htmlFor="docs-q">
            In den Dokumenten suchen
          </label>
          <input
            id="docs-q"
            type="search"
            autoComplete="off"
            placeholder="Firma, Betrag, Kennung oder Stichwort suchen"
            value={qText}
            onChange={(e) => setQText(e.target.value)}
          />
        </form>
        <button className="btn secondary" aria-expanded={panel} aria-controls="docs-filter" onClick={() => setPanel((v) => !v)}>
          {panel ? "Filter ausblenden" : "Filter einblenden"}
          {filterCount ? ` (${filterCount})` : ""}
        </button>
        <label className="sr" htmlFor="docs-sort">
          Sortierung
        </label>
        <select id="docs-sort" className="dx-select" value={filters.sort} onChange={(e) => change({ sort: e.target.value })}>
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {panel ? (
        <div id="docs-filter">
          <FilterPanel filters={filters} change={change} errors={errors} extended docTypes={meta.data?.doc_types ?? []} lookups={lookups} />
        </div>
      ) : null}

      <div className="chips" role="group" aria-label="Schnellfilter">
        <button className="chip" aria-pressed={filters.paid === "nein"} onClick={() => change({ paid: filters.paid === "nein" ? "" : "nein" })}>
          Offen
        </button>
        <button className="chip" aria-pressed={filters.paid === "ja"} onClick={() => change({ paid: filters.paid === "ja" ? "" : "ja" })}>
          Bezahlt
        </button>
        <button className="chip" aria-pressed={filters.state === "erkannt"} onClick={() => change({ state: filters.state === "erkannt" ? "" : "erkannt" })}>
          Zu prüfen
        </button>
        <button
          className="chip"
          aria-pressed={filters.archived === "nur"}
          onClick={() => change({ archived: filters.archived === "nur" ? "nein" : "nur" })}
        >
          Archiv
        </button>
        {(tags.data ?? []).slice(0, 6).map((t) => (
          <button
            key={t.id}
            className="chip"
            aria-pressed={filters.tag_ids.includes(t.id)}
            onClick={() => change({ tag_ids: filters.tag_ids.includes(t.id) ? filters.tag_ids.filter((x) => x !== t.id) : [...filters.tag_ids, t.id] })}
          >
            <span className="dx-tag" style={{ border: 0, background: "none", padding: 0, color: "inherit", fontSize: "inherit" }}>
              <i style={{ background: t.color }} aria-hidden="true" />
              {t.name}
            </span>
          </button>
        ))}
      </div>

      {hasFilters ? (
        <div className="dx-summary" aria-label="Aktive Filter">
          <span className="muted">Aktiv:</span>
          {chips.map((c) => (
            <button
              key={c.key}
              className="dx-chipx"
              onClick={() => {
                if (c.key === "q") setQText("");
                change(c.clear(filters));
              }}
              aria-label={`${c.label} entfernen`}
            >
              {c.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <button className="btn ghost small" onClick={resetAll}>
            Alle Filter entfernen
          </button>
        </div>
      ) : null}

      {selected.size ? (
        <div className="dx-bulk" role="region" aria-label="Auswahl">
          <strong>{selected.size === 1 ? "1 Dokument ausgewählt" : `${selected.size} Dokumente ausgewählt`}</strong>
          <button className="btn secondary small" onClick={() => setBulk("tag")}>
            Tag hinzufügen
          </button>
          {chosen.some((d) => !d.archived) ? (
            <button className="btn secondary small" onClick={() => setBulk("archive")}>
              Archivieren
            </button>
          ) : null}
          {chosen.some((d) => d.archived) ? (
            <button className="btn secondary small" onClick={() => void restoreSelected()}>
              Wiederherstellen
            </button>
          ) : null}
          <button className="btn ghost small" style={{ color: "#fff" }} onClick={() => setSelected(new Set())}>
            Auswahl aufheben
          </button>
        </div>
      ) : null}

      {list.isError ? (
        <ErrorBox error={list.error} retry={() => void list.refetch()} />
      ) : list.isPending ? (
        <Spinner />
      ) : (
        <div className="card flush" aria-busy={list.isFetching}>
          {items.length ? (
            <table className="tbl">
              <caption className="sr">
                Dokumente, {from} bis {to} von {total}
              </caption>
              <thead>
                <tr>
                  <th className="dx-checkcell">
                    <label>
                      <input
                        type="checkbox"
                        className="dx-check"
                        aria-label="Alle Dokumente auf dieser Seite auswählen"
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((d) => d.id)))}
                      />
                    </label>
                  </th>
                  <th scope="col">Dokument</th>
                  <th scope="col">Bereich</th>
                  <th scope="col" aria-sort={ariaSort("datum_ab", "datum_auf")}>
                    <button className="dx-sortbtn" onClick={() => sortBy("datum_ab", "datum_auf")}>
                      Datum{sortMark("datum_ab", "datum_auf")}
                    </button>
                  </th>
                  <th scope="col" className="num" aria-sort={ariaSort("betrag_ab", "betrag_auf")}>
                    <button className="dx-sortbtn" onClick={() => sortBy("betrag_ab", "betrag_auf")}>
                      Betrag{sortMark("betrag_ab", "betrag_auf")}
                    </button>
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id} className="click" onClick={() => open(d.id)} aria-selected={selected.has(d.id)}>
                    <td className="dx-checkcell" onClick={(e) => e.stopPropagation()}>
                      <label>
                        <input
                          type="checkbox"
                          className="dx-check"
                          aria-label={`${d.display_name} auswählen`}
                          checked={selected.has(d.id)}
                          onChange={() => toggle(d.id)}
                        />
                      </label>
                    </td>
                    <td>
                      <button className="dx-link" onClick={() => open(d.id)}>
                        {d.display_name}
                      </button>
                      <div className="muted" style={{ fontSize: "0.8125rem" }}>
                        {[d.doc_type, d.company_name].filter(Boolean).join(" · ") || "Noch nicht erkannt"}
                      </div>
                      {d.tags?.length ? (
                        <div className="dx-tags" style={{ marginTop: "0.25rem" }}>
                          {d.tags.map((t: Tag) => (
                            <TagBadge key={t.id} tag={t} />
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td>{d.category_name ?? "–"}</td>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>
                      {date(d.doc_date)}
                    </td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      {eur(d.amount_cents)}
                    </td>
                    <td>
                      <StatusBadges doc={d} deadline={deadlines.data?.get(d.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : hasFilters ? (
            <Empty
              title="Nichts gefunden."
              action={
                <button className="btn secondary" onClick={resetAll}>
                  Alle Filter entfernen
                </button>
              }
            >
              Probiere einen anderen Suchbegriff oder nimm einen Filter heraus.
            </Empty>
          ) : (
            <Empty
              title="Hier ist noch nichts."
              action={
                <button className="btn primary" onClick={() => go("import")}>
                  Fotos sortieren
                </button>
              }
            >
              Sobald du Fotos oder Scans importierst und prüfst, erscheinen sie hier.
            </Empty>
          )}
        </div>
      )}

      {total > 0 ? (
        <div className="dx-pager">
          <span className="muted" role="status">
            {from} bis {to} von {total}
          </span>
          <div className="row wrap">
            <label className="muted" htmlFor="docs-limit">
              Pro Seite
            </label>
            <select
              id="docs-limit"
              className="dx-select"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setOffset(0);
                setSelected(new Set());
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <button
              className="btn secondary"
              disabled={offset === 0}
              onClick={() => {
                setOffset(Math.max(0, offset - limit));
                setSelected(new Set());
              }}
            >
              ← Zurück
            </button>
            <span className="muted">
              Seite {Math.floor(offset / limit) + 1} von {Math.max(1, Math.ceil(total / limit))}
            </span>
            <button
              className="btn secondary"
              disabled={offset + limit >= total}
              onClick={() => {
                setOffset(offset + limit);
                setSelected(new Set());
              }}
            >
              Weiter →
            </button>
          </div>
        </div>
      ) : null}

      {manager ? <Manager onClose={() => setManager(false)} /> : null}
      {bulk === "tag" ? <BulkTag docs={chosen} onClose={() => setBulk(null)} onDone={() => setSelected(new Set())} /> : null}
      {bulk === "archive" ? (
        <BulkArchive docs={chosen.filter((d) => !d.archived)} onClose={() => setBulk(null)} onDone={() => setSelected(new Set())} />
      ) : null}
    </>
  );
}

function BulkTag({ docs, onClose, onDone }: { docs: Json[]; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const { toast } = useUi();
  const tags = useTags();
  const [tagId, setTagId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  const apply = async (id: number) => {
    setBusy(true);
    let failed = 0;
    for (const d of docs) {
      const ids: number[] = (d.tags ?? []).map((t: Tag) => t.id);
      if (ids.includes(id)) continue;
      try {
        await api.put(`/api/documents/${d.id}/tags`, { tag_ids: [...ids, id] });
      } catch (e) {
        failed++;
        if (failed === 1) toast(errorText(e), "bad");
      }
    }
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ["documents"] });
    void qc.invalidateQueries({ queryKey: ["tags"] });
    if (!failed) toast(docs.length === 1 ? "Tag hinzugefügt." : `Tag zu ${docs.length} Dokumenten hinzugefügt.`);
    onDone();
    onClose();
  };

  return (
    <Modal
      title="Tag hinzufügen"
      onClose={close}
      actions={
        <>
          <button className="btn ghost" onClick={close} disabled={busy}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={tagId === null || busy} onClick={() => tagId !== null && void apply(tagId)}>
            {busy ? "Wird hinzugefügt …" : "Hinzufügen"}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Der Tag wird zu {docs.length === 1 ? "dem ausgewählten Dokument" : `den ${docs.length} ausgewählten Dokumenten`} hinzugefügt. Vorhandene Tags bleiben.
      </p>
      {(tags.data ?? []).length ? (
        <div className="chips" role="group" aria-label="Tag wählen">
          {(tags.data ?? []).map((t) => (
            <button key={t.id} className="chip" aria-pressed={tagId === t.id} onClick={() => setTagId(t.id)}>
              <span className="dx-tag" style={{ border: 0, background: "none", padding: 0, color: "inherit", fontSize: "inherit" }}>
                <i style={{ background: t.color }} aria-hidden="true" />
                {t.name}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <h3>Neuen Tag anlegen</h3>
      <NewTagForm label="Anlegen und auswählen" onCreated={(t) => setTagId(t.id)} />
    </Modal>
  );
}

function BulkArchive({ docs, onClose, onDone }: { docs: Json[]; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const { toast } = useUi();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  const run = async () => {
    setBusy(true);
    let failed = 0;
    for (const d of docs) {
      try {
        await api.post(`/api/documents/${d.id}/archive`, { reason: reason.trim() });
      } catch (e) {
        failed++;
        if (failed === 1) toast(errorText(e), "bad");
      }
    }
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ["documents"] });
    if (!failed) toast(docs.length === 1 ? "Archiviert." : `${docs.length} Dokumente archiviert.`);
    onDone();
    onClose();
  };

  return (
    <Modal
      title={docs.length === 1 ? "Dokument archivieren" : `${docs.length} Dokumente archivieren`}
      onClose={close}
      actions={
        <>
          <button className="btn ghost" onClick={close} disabled={busy}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={!reason.trim() || busy} onClick={() => void run()}>
            {busy ? "Wird archiviert …" : "Archivieren"}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Archivierte Dokumente verschwinden aus der normalen Liste und aus Fristen und Auswertungen. Gelöscht wird nichts. Du kannst sie jederzeit wiederherstellen.
      </p>
      <div className="field">
        <label htmlFor="bulk-reason">Grund</label>
        <input id="bulk-reason" value={reason} placeholder="z. B. Vertrag ist beendet" onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  );
}
