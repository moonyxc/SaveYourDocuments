import { useCallback, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "../../lib/api";
import { Empty, ErrorBox, Modal, Spinner, useUi } from "../ui";
import { useCategories, useCompanies, useTags, type Company, type Tag } from "./common";
import { ColorPick, NewTagForm } from "./tags";

type TabId = "firmen" | "bereiche" | "tags";
const TABS: [TabId, string][] = [
  ["firmen", "Firmen"],
  ["bereiche", "Bereiche"],
  ["tags", "Tags"],
];

export default function Manager({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabId>("firmen");
  const close = useCallback(() => {
    // Ein offener Bestaetigungsdialog schliesst sich selbst mit Escape, dann bleibt dieses Fenster stehen.
    if (document.querySelectorAll(".modal").length > 1) return;
    onClose();
  }, [onClose]);
  return (
    <Modal
      title="Firmen, Bereiche und Tags verwalten"
      wide
      onClose={close}
      actions={
        <button className="btn primary" onClick={onClose}>
          Fertig
        </button>
      }
    >
      <div className="dx-tabs" role="tablist" aria-label="Was möchtest du verwalten?">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            id={`mgr-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="mgr-panel"
            onClick={() => setTab(id)}
            onKeyDown={(e) => {
              const i = TABS.findIndex(([t]) => t === tab);
              if (e.key === "ArrowRight") setTab(TABS[(i + 1) % TABS.length][0]);
              if (e.key === "ArrowLeft") setTab(TABS[(i + TABS.length - 1) % TABS.length][0]);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div id="mgr-panel" role="tabpanel" aria-labelledby={`mgr-tab-${tab}`}>
        {tab === "firmen" ? <CompaniesTab /> : tab === "bereiche" ? <CategoriesTab /> : <TagsTab />}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Firmen

function CompaniesTab() {
  const companies = useCompanies();
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  if (companies.isPending) return <Spinner />;
  if (companies.isError) return <ErrorBox error={companies.error} retry={() => void companies.refetch()} />;
  const all = companies.data;
  const shown = all.filter((c) => !filter.trim() || [c.name, ...c.aliases].some((n) => n.toLowerCase().includes(filter.trim().toLowerCase())));
  if (!all.length)
    return (
      <Empty title="Noch keine Firmen">
        Firmen entstehen beim Prüfen von Dokumenten. Du kannst sie danach hier umbenennen oder zusammenführen.
      </Empty>
    );
  return (
    <div>
      <div className="field">
        <label htmlFor="mgr-company-filter">Firma suchen</label>
        <input id="mgr-company-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <p className="muted" role="status">
        {shown.length === all.length ? `${all.length} Firmen` : `${shown.length} von ${all.length} Firmen`}
      </p>
      {shown.length ? (
        <ul className="list">
          {shown.map((c) => (
            <li key={c.id} style={{ listStyle: "none" }}>
              <div className="item">
                <div className="grow">
                  <strong>{c.name}</strong>
                  <div className="muted">
                    {c.documents === 1 ? "1 Dokument" : `${c.documents} Dokumente`}
                    {c.aliases.length ? ` · auch bekannt als ${c.aliases.join(", ")}` : ""}
                  </div>
                </div>
                <button className="btn secondary small" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
                  {open === c.id ? "Schließen" : "Bearbeiten"}
                </button>
              </div>
              {open === c.id ? <CompanyEdit company={c} all={all} onGone={() => setOpen(null)} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Keine Firma gefunden. Prüfe die Schreibweise.</p>
      )}
    </div>
  );
}

function CompanyEdit({ company, all, onGone }: { company: Company; all: Company[]; onGone: () => void }) {
  const { toast, confirm } = useUi();
  const qc = useQueryClient();
  const uid = useId();
  const [name, setName] = useState(company.name);
  const [alias, setAlias] = useState("");
  const [target, setTarget] = useState("");
  const refresh = () => void qc.invalidateQueries();
  const similar = useQuery({
    queryKey: ["companies", "similar-to", company.id, company.name],
    queryFn: () => api.get<{ items: { id: number; name: string }[] }>("/api/companies/similar", { name: company.name }),
  });
  const run = async (fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    try {
      await fn();
      refresh();
      toast(ok);
      after?.();
    } catch (e) {
      toast(errorText(e), "bad");
    }
  };
  const merge = async (targetId: number) => {
    const t = all.find((c) => c.id === targetId);
    if (!t) return;
    const ok = await confirm({
      title: "Firmen zusammenführen?",
      text: `Alle ${company.documents} Dokumente von „${company.name}“ gehören danach zu „${t.name}“. „${company.name}“ bleibt als weitere Schreibweise erhalten. Das lässt sich nicht automatisch rückgängig machen.`,
      confirmLabel: "Zusammenführen",
      danger: true,
    });
    if (ok) await run(() => api.post(`/api/companies/${company.id}/merge`, { target_id: targetId }), `Zusammengeführt mit „${t.name}“.`, onGone);
  };
  const suggestions = (similar.data?.items ?? []).filter((s) => s.id !== company.id);
  return (
    <div className="card" style={{ margin: "0.5rem 0 1rem", background: "var(--bg-primary)" }}>
      <form
        className="row wrap"
        style={{ alignItems: "flex-end" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && name.trim() !== company.name) void run(() => api.patch(`/api/companies/${company.id}`, { name: name.trim() }), "Umbenannt.");
        }}
      >
        <div className="field" style={{ margin: 0, flex: 1, minWidth: "12rem" }}>
          <label htmlFor={`${uid}-n`}>Name</label>
          <input id={`${uid}-n`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn secondary" type="submit" disabled={!name.trim() || name.trim() === company.name}>
          Umbenennen
        </button>
      </form>
      <form
        className="row wrap"
        style={{ alignItems: "flex-end", marginTop: "0.75rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (alias.trim()) void run(() => api.post(`/api/companies/${company.id}/aliases`, { alias: alias.trim() }), "Schreibweise gespeichert.", () => setAlias(""));
        }}
      >
        <div className="field" style={{ margin: 0, flex: 1, minWidth: "12rem" }}>
          <label htmlFor={`${uid}-a`}>Weitere Schreibweise</label>
          <input id={`${uid}-a`} value={alias} maxLength={120} placeholder="So steht die Firma manchmal auf Briefen" onChange={(e) => setAlias(e.target.value)} />
        </div>
        <button className="btn secondary" type="submit" disabled={!alias.trim()}>
          Hinzufügen
        </button>
      </form>
      {suggestions.length ? (
        <div className="suggest" style={{ marginTop: "0.75rem" }}>
          <strong>Das könnte dieselbe Firma sein</strong>
          <div className="dx-pick">
            {suggestions.map((s) => (
              <button key={s.id} type="button" onClick={() => void merge(s.id)}>
                Mit „{s.name}“ zusammenführen
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="row wrap" style={{ alignItems: "flex-end", marginTop: "0.75rem" }}>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: "12rem" }}>
          <label htmlFor={`${uid}-m`}>Mit anderer Firma zusammenführen</label>
          <select id={`${uid}-m`} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Firma wählen …</option>
            {all
              .filter((c) => c.id !== company.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
        <button className="btn danger" disabled={!target} onClick={() => void merge(Number(target))}>
          Zusammenführen …
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Bereiche

function CategoriesTab() {
  const cats = useCategories();
  const qc = useQueryClient();
  const { toast } = useUi();
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const create = useMutation({
    mutationFn: () => api.post("/api/categories", { name: name.trim(), parent_id: parent ? Number(parent) : null }),
    onSuccess: () => {
      setName("");
      void qc.invalidateQueries({ queryKey: ["categories"] });
      toast("Bereich angelegt.");
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  if (cats.isPending) return <Spinner />;
  if (cats.isError) return <ErrorBox error={cats.error} retry={() => void cats.refetch()} />;
  const list = cats.data;
  const nameOf = (id: number | null) => list.find((c) => c.id === id)?.name;
  return (
    <div>
      {list.length ? (
        <ul className="list">
          {list.map((c) => (
            <li key={c.id} className="item">
              <div className="grow">
                <strong>{c.name}</strong>
                {c.parent_id ? <span className="muted"> · gehört zu {nameOf(c.parent_id)}</span> : null}
              </div>
              <span className="muted">{c.documents === 1 ? "1 Dokument" : `${c.documents} Dokumente`}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Noch keine Bereiche">Lege hier den ersten Bereich an, zum Beispiel „Wohnen“.</Empty>
      )}
      <form
        className="row wrap"
        style={{ alignItems: "flex-end", marginTop: "1rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <div className="field" style={{ margin: 0, flex: 1, minWidth: "10rem" }}>
          <label htmlFor="cat-name">Neuer Bereich</label>
          <input id="cat-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="cat-parent">Gehört zu</label>
          <select id="cat-parent" value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Keinem (oberste Ebene)</option>
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn secondary" type="submit" disabled={!name.trim() || create.isPending}>
          Anlegen
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- Tags

function TagsTab() {
  const tags = useTags();
  const [editing, setEditing] = useState<number | null>(null);
  if (tags.isPending) return <Spinner />;
  if (tags.isError) return <ErrorBox error={tags.error} retry={() => void tags.refetch()} />;
  return (
    <div>
      {tags.data.length ? (
        <ul className="list">
          {tags.data.map((t) => (
            <li key={t.id} style={{ listStyle: "none" }}>
              <div className="item">
                <span className="dx-tag">
                  <i style={{ background: t.color }} aria-hidden="true" />
                  {t.name}
                </span>
                <span className="muted grow">{t.documents === 1 ? "1 Dokument" : `${t.documents ?? 0} Dokumente`}</span>
                <button className="btn secondary small" aria-expanded={editing === t.id} onClick={() => setEditing(editing === t.id ? null : t.id)}>
                  {editing === t.id ? "Schließen" : "Bearbeiten"}
                </button>
              </div>
              {editing === t.id ? <TagEdit tag={t} onGone={() => setEditing(null)} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Noch keine Tags.</p>
      )}
      <h3 style={{ marginTop: "1.25rem" }}>Neuen Tag anlegen</h3>
      <NewTagForm />
    </div>
  );
}

function TagEdit({ tag, onGone }: { tag: Tag; onGone: () => void }) {
  const { toast, confirm } = useUi();
  const qc = useQueryClient();
  const uid = useId();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const refresh = () => void qc.invalidateQueries();
  const save = useMutation({
    mutationFn: () => api.patch(`/api/tags/${tag.id}`, { name: name.trim(), color }),
    onSuccess: () => {
      refresh();
      toast("Gespeichert.");
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  const remove = async () => {
    const ok = await confirm({
      title: `Tag „${tag.name}“ löschen?`,
      text: "Nur das Etikett wird entfernt. Die Dokumente bleiben unverändert.",
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/tags/${tag.id}`);
      refresh();
      toast("Tag gelöscht.");
      onGone();
    } catch (e) {
      toast(errorText(e), "bad");
    }
  };
  return (
    <form
      className="card"
      style={{ margin: "0.5rem 0 1rem", background: "var(--bg-primary)" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) save.mutate();
      }}
    >
      <div className="field">
        <label htmlFor={`${uid}-n`}>Name</label>
        <input id={`${uid}-n`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </div>
      <ColorPick value={color} onChange={setColor} />
      <div className="row" style={{ marginTop: "0.75rem" }}>
        <button className="btn primary small" type="submit" disabled={!name.trim() || save.isPending || (name.trim() === tag.name && color === tag.color)}>
          Speichern
        </button>
        <button className="btn danger small" type="button" onClick={() => void remove()}>
          Tag löschen
        </button>
      </div>
    </form>
  );
}
