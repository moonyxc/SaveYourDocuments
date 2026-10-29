import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText, type Json } from "../../lib/api";
import { date, dateTime, relativeDays } from "../../lib/format";
import { useNav } from "../../lib/nav";
import { Badge, Spinner, useUi } from "../ui";
import { DEADLINE_LABEL, FIELD_LABEL, REF_LABEL, TagBadge, useCompanies, useMeta, useTags, type Tag } from "./common";
import { NewTagForm } from "./tags";

const useRefresh = () => {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries();
};

// ---------------------------------------------------------------- Firma waehlen / anlegen

export type CompanyDraft = { id: string; name: string };

export function CompanyEditor({ draft, set, id }: { draft: CompanyDraft; set: (d: CompanyDraft) => void; id: string }) {
  const companies = useCompanies();
  const creating = draft.id === "__new";
  const [typed, setTyped] = useState(draft.name);
  useEffect(() => {
    const t = window.setTimeout(() => setTyped(draft.name.trim()), 350);
    return () => window.clearTimeout(t);
  }, [draft.name]);
  const similar = useQuery({
    queryKey: ["companies", "similar", typed],
    queryFn: () => api.get<{ items: { id: number; name: string }[] }>("/api/companies/similar", { name: typed }),
    enabled: creating && typed.length >= 3,
  });
  return (
    <>
      <select id={id} value={draft.id} onChange={(e) => set({ id: e.target.value, name: "" })}>
        <option value="">Keine Firma</option>
        {(companies.data ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value="__new">＋ Neue Firma anlegen …</option>
      </select>
      {creating ? (
        <div style={{ marginTop: "0.5rem" }}>
          <input aria-label="Name der neuen Firma" placeholder="Name der neuen Firma" value={draft.name} maxLength={120} onChange={(e) => set({ id: "__new", name: e.target.value })} />
          {(similar.data?.items ?? []).length ? (
            <div className="suggest" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              <strong>Gibt es die Firma schon?</strong>
              <div className="dx-pick">
                {similar.data?.items.map((s) => (
                  <button key={s.id} type="button" onClick={() => set({ id: String(s.id), name: "" })}>
                    Stattdessen „{s.name}“ verwenden
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- Tags

export function TagsCard({ doc }: { doc: Json }) {
  const { toast } = useUi();
  const refresh = useRefresh();
  const all = useTags();
  const [adding, setAdding] = useState(false);
  const current: Tag[] = doc.tags ?? [];
  const free = (all.data ?? []).filter((t) => !current.some((c) => c.id === t.id));
  const put = useMutation({
    mutationFn: (ids: number[]) => api.put(`/api/documents/${doc.id}/tags`, { tag_ids: ids }),
    onSuccess: refresh,
    onError: (e) => toast(errorText(e), "bad"),
  });
  const ids = current.map((t) => t.id);
  return (
    <div className="card">
      <h2>Tags</h2>
      {current.length ? (
        <div className="dx-tags" style={{ marginBottom: "0.75rem" }}>
          {current.map((t) => (
            <TagBadge key={t.id} tag={t} onRemove={() => put.mutate(ids.filter((i) => i !== t.id))} />
          ))}
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          Noch keine Tags. Mit Tags findest du zusammengehörige Dokumente schneller.
        </p>
      )}
      {free.length ? (
        <div className="chips" role="group" aria-label="Tag hinzufügen" style={{ marginBottom: "0.5rem" }}>
          {free.map((t) => (
            <button key={t.id} className="chip" onClick={() => put.mutate([...ids, t.id])} aria-label={`Tag „${t.name}“ hinzufügen`}>
              <span className="dx-tag" style={{ border: 0, background: "none", padding: 0, color: "inherit", fontSize: "inherit" }}>
                <i style={{ background: t.color }} aria-hidden="true" />＋ {t.name}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {adding ? (
        <div>
          <NewTagForm
            label="Anlegen und hinzufügen"
            onCreated={(t) => {
              put.mutate([...ids, t.id]);
              setAdding(false);
            }}
          />
        </div>
      ) : (
        <button className="btn secondary small" onClick={() => setAdding(true)}>
          Neuen Tag anlegen
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Kennungen

export function RefsCard({ doc }: { doc: Json }) {
  const { toast } = useUi();
  const refresh = useRefresh();
  const meta = useMeta();
  const refs: Json[] = doc.references ?? [];
  const [type, setType] = useState("aktenzeichen");
  const [value, setValue] = useState("");
  const put = useMutation({
    mutationFn: (list: Json[]) =>
      api.put(`/api/documents/${doc.id}/references`, {
        references: list.map((r) => ({ type: r.type, value: r.value, source: r.source, confirmed: r.confirmed })),
      }),
    onSuccess: refresh,
    onError: (e) => toast(errorText(e), "bad"),
  });
  const add = () => {
    if (value.trim().length < 3) {
      toast("Eine Kennung hat mindestens 3 Zeichen.", "bad");
      return;
    }
    put.mutate([...refs, { type, value: value.trim(), source: "manuell", confirmed: true }], { onSuccess: () => setValue("") });
  };
  return (
    <div className="card">
      <h2>Kennungen</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Aktenzeichen, Kunden- und Vertragsnummern. Damit schlägt das Programm zusammengehörige Dokumente vor.
      </p>
      {refs.length ? (
        <ul className="list">
          {refs.map((r) => (
            <li key={r.id} className="item">
              <div className="grow">
                <span className="muted">{REF_LABEL[r.type] ?? r.type}</span>
                <div className="mono" style={{ color: "var(--text-primary)" }}>
                  {r.value}
                </div>
              </div>
              {!r.confirmed ? <Badge tone="purple">Vorschlag</Badge> : null}
              <button className="btn ghost small" aria-label={`${REF_LABEL[r.type] ?? r.type} ${r.value} entfernen`} onClick={() => put.mutate(refs.filter((x) => x.id !== r.id))}>
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Keine Kennungen erkannt.</p>
      )}
      <form
        className="row wrap"
        style={{ alignItems: "flex-end", marginTop: "0.75rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="ref-type">Art</label>
          <select id="ref-type" value={type} onChange={(e) => setType(e.target.value)}>
            {(meta.data?.reference_types ?? Object.keys(REF_LABEL)).map((t: string) => (
              <option key={t} value={t}>
                {REF_LABEL[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: "8rem" }}>
          <label htmlFor="ref-value">Nummer</label>
          <input id="ref-value" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <button className="btn secondary" type="submit" disabled={put.isPending}>
          Hinzufügen
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- Fristen

export function DeadlinesCard({ doc }: { doc: Json }) {
  const { toast, confirm } = useUi();
  const refresh = useRefresh();
  const meta = useMeta();
  const list: Json[] = doc.deadlines ?? [];
  const [type, setType] = useState("zahlungsziel");
  const [due, setDue] = useState("");
  const done = useMutation({
    mutationFn: (v: { id: number; done: boolean }) => api.post(`/api/deadlines/${v.id}/complete`, { done: v.done }),
    onSuccess: refresh,
    onError: (e) => toast(errorText(e), "bad"),
  });
  const create = useMutation({
    mutationFn: () => api.post(`/api/documents/${doc.id}/deadlines`, { type, due_date: due }),
    onSuccess: () => {
      setDue("");
      refresh();
      toast("Frist gespeichert. Du wirst rechtzeitig erinnert.");
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  const remove = async (d: Json) => {
    const ok = await confirm({
      title: "Frist entfernen?",
      text: `${DEADLINE_LABEL[d.type] ?? "Frist"} am ${date(d.due_date)} und ihre Erinnerungen werden entfernt.`,
      confirmLabel: "Entfernen",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/deadlines/${d.id}`);
      refresh();
    } catch (e) {
      toast(errorText(e), "bad");
    }
  };
  return (
    <div className="card">
      <h2>Fristen</h2>
      {list.length ? (
        <ul className="list">
          {list.map((d) => (
            <li key={d.id} className="item" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
              <div className="grow">
                <strong>{DEADLINE_LABEL[d.type] ?? "Frist"}</strong>
                <div>
                  <span className="mono">{date(d.due_date)}</span> <span className="muted">· {relativeDays(d.due_date)}</span>
                </div>
                {d.note ? <div className="muted">{d.note}</div> : null}
                <div className="dx-tags" style={{ marginTop: "0.25rem" }}>
                  {!d.confirmed ? (
                    <Badge tone="purple" title="Diese Frist wurde erkannt, aber noch nicht bestätigt. Erinnerungen gibt es erst nach der Bestätigung unter „Prüfen“.">
                      ? Vorschlag, noch nicht bestätigt
                    </Badge>
                  ) : d.status === "erledigt" ? (
                    <Badge tone="green">✓ Erledigt</Badge>
                  ) : d.overdue ? (
                    <Badge tone="red">⚠ Überfällig</Badge>
                  ) : (
                    <Badge tone="yellow">⏱ Offen</Badge>
                  )}
                  {d.repeat_months ? <Badge tone="gray">↻ Wiederholt sich alle {d.repeat_months} Monate</Badge> : null}
                </div>
              </div>
              <div className="row wrap">
                {d.confirmed ? (
                  <button className="btn secondary small" onClick={() => done.mutate({ id: d.id, done: d.status !== "erledigt" })}>
                    {d.status === "erledigt" ? "Wieder öffnen" : "Als erledigt markieren"}
                  </button>
                ) : null}
                <button className="btn ghost small" onClick={() => void remove(d)} aria-label={`${DEADLINE_LABEL[d.type] ?? "Frist"} am ${date(d.due_date)} entfernen`}>
                  Entfernen
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          Dieses Dokument hat keine Fristen.
        </p>
      )}
      <form
        className="row wrap"
        style={{ alignItems: "flex-end", marginTop: "0.75rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!due) {
            toast("Bitte ein Datum für die Frist wählen.", "bad");
            return;
          }
          create.mutate();
        }}
      >
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="dl-type">Neue Frist</label>
          <select id="dl-type" value={type} onChange={(e) => setType(e.target.value)}>
            {(meta.data?.deadline_types ?? Object.keys(DEADLINE_LABEL)).map((t: string) => (
              <option key={t} value={t}>
                {DEADLINE_LABEL[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="dl-due">Datum</label>
          <input id="dl-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <button className="btn secondary" type="submit" disabled={create.isPending}>
          Frist hinzufügen
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- Verknuepfungen

const LINK_OUT: Record<string, string> = { antwort_auf: "Antwort auf", gehoert_zu: "Gehört zu", ersetzt: "Ersetzt" };
const LINK_IN: Record<string, string> = { antwort_auf: "Hat als Antwort", gehoert_zu: "Dazu gehört", ersetzt: "Ersetzt durch" };
const LINK_NEW: Record<string, string> = {
  antwort_auf: "Dieses Dokument ist eine Antwort auf …",
  gehoert_zu: "Dieses Dokument gehört zu …",
  ersetzt: "Dieses Dokument ersetzt …",
};

export function LinksCard({ doc }: { doc: Json }) {
  const { toast, confirm } = useUi();
  const refresh = useRefresh();
  const { go } = useNav();
  const links: Json[] = doc.links ?? [];
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [typed, setTyped] = useState("");
  const [target, setTarget] = useState<number | null>(null);
  const [type, setType] = useState("gehoert_zu");

  useEffect(() => {
    const t = window.setTimeout(() => setTyped(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  const found = useQuery({
    queryKey: ["documents", "link-picker", typed],
    queryFn: () => api.get<{ items: Json[] }>("/api/documents", { q: typed, limit: 8, archived: "ja", sort: "import_ab" }),
    enabled: picking,
  });
  const linked = new Set(links.map((l) => l.other.id));
  const candidates = (found.data?.items ?? []).filter((d) => d.id !== doc.id && !linked.has(d.id));

  const act = async (fn: () => Promise<unknown>, okText?: string) => {
    try {
      await fn();
      refresh();
      if (okText) toast(okText);
    } catch (e) {
      toast(errorText(e), "bad");
    }
  };
  const label = (o: Json) => [o.doc_type ?? "Dokument", o.company_name].filter(Boolean).join(" · ") + (o.doc_date ? ` · ${date(o.doc_date)}` : "");

  return (
    <div className="card">
      <h2>Verknüpfte Dokumente</h2>
      {links.length ? (
        <ul className="list">
          {links.map((l) => {
            const names = l.direction === "ausgehend" ? LINK_OUT : LINK_IN;
            const proposed = l.status === "vorgeschlagen";
            return (
              <li key={l.id} className="item" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                <div className="grow">
                  <span className="muted">{names[l.type] ?? l.type}</span>
                  <div>
                    <button className="dx-link" style={{ minHeight: "2rem" }} onClick={() => go("docs", { doc: l.other.id })}>
                      {label(l.other)}
                    </button>
                  </div>
                  {proposed ? (
                    <div className="suggest" style={{ margin: "0.5rem 0 0" }}>
                      <Badge tone="purple">Vorschlag</Badge>
                      <p style={{ margin: "0.25rem 0 0" }}>{l.reason || "Die Dokumente scheinen zusammenzugehören."}</p>
                    </div>
                  ) : null}
                </div>
                <div className="row wrap">
                  {proposed ? (
                    <>
                      <button className="btn secondary small" onClick={() => void act(() => api.post(`/api/links/${l.id}/confirm`, {}), "Verknüpft.")}>
                        Ja, verknüpfen
                      </button>
                      <button className="btn ghost small" onClick={() => void act(() => api.post(`/api/links/${l.id}/reject`), "Merke ich mir: nicht verknüpft.")}>
                        Nein
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn ghost small"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Verknüpfung lösen?",
                          text: "Die Dokumente bleiben erhalten. Das Programm schlägt diese Verknüpfung nicht noch einmal vor.",
                          confirmLabel: "Lösen",
                        });
                        if (ok) void act(() => api.del(`/api/links/${l.id}`), "Verknüpfung gelöst.");
                      }}
                    >
                      Lösen
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          Dieses Dokument ist mit keinem anderen verknüpft.
        </p>
      )}
      {picking ? (
        <form
          style={{ marginTop: "0.75rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (target === null) return;
            void act(() => api.post("/api/links", { from_id: doc.id, to_id: target, link_type: type }), "Verknüpft.").then(() => {
              setPicking(false);
              setTarget(null);
              setQ("");
            });
          }}
        >
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="link-q">Welches Dokument?</label>
            <input id="link-q" type="search" value={q} placeholder="Firma, Betrag oder Stichwort suchen" onChange={(e) => setQ(e.target.value)} />
          </div>
          {found.isPending ? (
            <Spinner />
          ) : candidates.length ? (
            <div className="dx-pick" role="group" aria-label="Gefundene Dokumente">
              {candidates.map((d) => (
                <button type="button" key={d.id} aria-pressed={target === d.id} onClick={() => setTarget(d.id)}>
                  <strong style={{ color: "inherit" }}>{d.display_name}</strong>
                  <div className="muted" style={{ fontSize: "0.8125rem" }}>
                    {label(d)}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">Nichts gefunden. Probiere einen anderen Suchbegriff.</p>
          )}
          <div className="field">
            <label htmlFor="link-type">Art der Verknüpfung</label>
            <select id="link-type" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(LINK_NEW).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <button className="btn primary small" type="submit" disabled={target === null}>
              Verknüpfen
            </button>
            <button className="btn ghost small" type="button" onClick={() => setPicking(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      ) : (
        <button className="btn secondary small" style={{ marginTop: "0.5rem" }} onClick={() => setPicking(true)}>
          Dokument verknüpfen
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Text, Verlauf

export function OcrCard({ docId }: { docId: number }) {
  const { toast } = useUi();
  const [open, setOpen] = useState(false);
  const text = useQuery({
    queryKey: ["document", docId, "text"],
    queryFn: () => api.get<{ pages: { page: number; text: string; confidence: number | null }[] }>(`/api/documents/${docId}/text`),
    enabled: open,
  });
  const pages = text.data?.pages ?? [];
  const all = pages.map((p) => p.text).join("\n\n");
  return (
    <details className="card dx-detail" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>Erkannter Text</summary>
      {!open ? null : text.isPending ? (
        <Spinner />
      ) : text.isError ? (
        <p className="err">{errorText(text.error)}</p>
      ) : pages.length && all.trim() ? (
        <>
          <div className="row" style={{ margin: "0.25rem 0" }}>
            <button
              className="btn secondary small"
              onClick={() =>
                void navigator.clipboard.writeText(all).then(
                  () => toast("Text kopiert."),
                  () => toast("Das Kopieren hat nicht geklappt. Markiere den Text und kopiere ihn von Hand.", "bad"),
                )
              }
            >
              Text kopieren
            </button>
          </div>
          {pages.map((p) => (
            <div key={p.page}>
              {pages.length > 1 ? <div className="label" style={{ marginTop: "0.75rem" }}>Seite {p.page}</div> : null}
              <pre className="dx-ocr" tabIndex={0}>
                {p.text}
              </pre>
            </div>
          ))}
        </>
      ) : (
        <p className="muted">Es wurde kein Text erkannt.</p>
      )}
    </details>
  );
}

export function HistoryCard({ doc }: { doc: Json }) {
  const history: Json[] = doc.history ?? [];
  const extractions: Json[] = doc.extractions ?? [];
  const show = (v: string | null, field: string) => {
    if (v === null || v === "") return "leer";
    if (field === "amount_cents" && /^-?\d+$/.test(v)) return `${(Number(v) / 100).toFixed(2).replace(".", ",")} €`;
    if (field === "doc_date") return date(v);
    if (field === "company_id" || field === "category_id") return `Nr. ${v}`;
    return v;
  };
  return (
    <details className="card dx-detail">
      <summary>Änderungen und Erkennung</summary>
      <h3 style={{ marginTop: "0.5rem" }}>Änderungen</h3>
      {history.length ? (
        <ul className="dx-hist">
          {history.map((h, i) => (
            <li key={i}>
              <strong>{FIELD_LABEL[h.field] ?? h.field}</strong>: {show(h.old, h.field)} → {show(h.new, h.field)}
              <div className="muted">
                {dateTime(h.changed_at)} · {h.by === "nutzer" ? "von dir" : "automatisch"}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Noch keine Änderungen.</p>
      )}
      <h3>Was das Programm erkannt hat</h3>
      {extractions.length ? (
        <ul className="dx-hist">
          {extractions.map((x, i) => (
            <li key={i}>
              <strong>{FIELD_LABEL[x.field] ?? x.field}</strong>: {x.value ?? "–"}
              <div className="muted">
                Sicherheit {x.confidence !== null ? `${Math.round(x.confidence * 100)} %` : "unbekannt"} · {x.source === "regex" ? "Mustererkennung" : x.source === "manuell" ? "von dir" : x.source}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Keine Erkennungswerte gespeichert.</p>
      )}
    </details>
  );
}

