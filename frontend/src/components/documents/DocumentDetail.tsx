import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorText, mediaUrl, type Json } from "../../lib/api";
import { bytes, centsToInput, date, dateTime, eur, parseEuro, todayIso } from "../../lib/format";
import { useNav } from "../../lib/nav";
import { Badge, ErrorBox, Modal, Spinner, useUi } from "../ui";
import { StateBadge, STATE_LABEL, useCategories, useMeta } from "./common";
import { CompanyEditor, DeadlinesCard, HistoryCard, LinksCard, OcrCard, RefsCard, TagsCard, type CompanyDraft } from "./Cards";
import InlineEdit from "./InlineEdit";
import Viewer from "./Viewer";

const PAYABLE = new Set(["Rechnung", "Beitragsrechnung", "Mahnung", "Jahresabrechnung", "Kaufbeleg"]);

export default function DocumentDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { toast } = useUi();
  const { go } = useNav();
  const qc = useQueryClient();
  const meta = useMeta();
  const categories = useCategories();
  const [archiving, setArchiving] = useState(false);
  const [reason, setReason] = useState("");
  const [paying, setPaying] = useState(false);
  const [paidAt, setPaidAt] = useState(todayIso());

  const q = useQuery({ queryKey: ["document", id], queryFn: () => api.get<Json>(`/api/documents/${id}`) });
  const refresh = () => void qc.invalidateQueries();

  const patch = async (fields: Json) => {
    await api.patch(`/api/documents/${id}`, fields);
    refresh();
    toast("Gespeichert.");
  };

  const archive = useMutation({
    mutationFn: () => api.post(`/api/documents/${id}/archive`, { reason: reason.trim() }),
    onSuccess: () => {
      setArchiving(false);
      setReason("");
      refresh();
      toast("Archiviert. Das Dokument bleibt gespeichert und ist über den Filter „Archiv“ auffindbar.");
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  const restore = useMutation({
    mutationFn: () => api.post(`/api/documents/${id}/restore`),
    onSuccess: () => {
      refresh();
      toast("Wiederhergestellt.");
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  const paid = useMutation({
    mutationFn: (v: { paid: boolean; paid_at?: string }) => api.post(`/api/documents/${id}/paid`, v),
    onSuccess: (_d, v) => {
      setPaying(false);
      refresh();
      toast(v.paid ? "Als bezahlt markiert." : "Wieder als offen markiert.");
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  const reprocess = useMutation({
    mutationFn: () => api.post(`/api/documents/${id}/reprocess`),
    onSuccess: () => {
      refresh();
      toast("Das Dokument wird neu erkannt.");
    },
    onError: (e) => toast(errorText(e), "bad"),
  });

  const closeArchive = useCallback(() => setArchiving(false), []);
  const closePay = useCallback(() => setPaying(false), []);

  if (q.isPending) return <Spinner />;
  if (q.isError)
    return (
      <>
        <button className="btn ghost" onClick={onBack}>
          ← Zurück zur Liste
        </button>
        <ErrorBox error={q.error} retry={() => void q.refetch()} />
      </>
    );
  const d = q.data;
  const reviewed = d.state === "geprueft";
  const running = d.state === "eingegangen" || d.state === "verarbeitet";
  const failed = d.job?.state === "fehler" || !!d.job?.error_code;
  const payable = PAYABLE.has(d.doc_type ?? "") || d.amount_cents != null;
  const parts: Json[] = d.parts ?? [];
  const firstPart = parts[0];

  return (
    <div>
      <div className="row spread wrap" style={{ marginBottom: "0.5rem" }}>
        <button className="btn ghost" onClick={onBack}>
          ← Zurück zur Liste
        </button>
        <div className="row wrap">
          {firstPart ? (
            <a className="btn secondary" href={mediaUrl(`/api/documents/${id}/parts/${firstPart.page}/file`, { download: true })} download>
              Original herunterladen
            </a>
          ) : null}
          {!reviewed && (failed || !running) ? (
            <button className="btn secondary" disabled={reprocess.isPending} onClick={() => reprocess.mutate()}>
              Neu erkennen
            </button>
          ) : null}
          {d.archived ? (
            <button className="btn secondary" disabled={restore.isPending} onClick={() => restore.mutate()}>
              Wiederherstellen
            </button>
          ) : (
            <button className="btn secondary" onClick={() => setArchiving(true)}>
              Archivieren
            </button>
          )}
        </div>
      </div>

      <h1 style={{ overflowWrap: "anywhere" }}>{d.display_name}</h1>
      <div className="row wrap" style={{ marginBottom: "1rem" }}>
        <StateBadge doc={d} />
        {d.archived ? <Badge tone="gray">▣ Archiviert</Badge> : null}
        {reviewed && payable ? d.paid ? <Badge tone="green">✓ Bezahlt{d.paid_at ? ` am ${date(d.paid_at)}` : ""}</Badge> : <Badge tone="yellow">○ Offen</Badge> : null}
      </div>

      {d.archived ? (
        <div className="notice" role="status">
          <strong>Dieses Dokument ist archiviert.</strong>
          {d.archive_reason ? <> Grund: {d.archive_reason}</> : null} Es erscheint nicht mehr in Fristen und Erinnerungen.
        </div>
      ) : null}
      {running ? (
        <div className="notice" role="status">
          <Spinner label="Das Dokument wird gerade erkannt. Das dauert meist nur einen Moment." />
        </div>
      ) : null}
      {failed && !reviewed ? (
        <div className="notice bad" role="alert">
          Beim Erkennen ist etwas schiefgelaufen. Wähle „Neu erkennen“. Wenn es wieder nicht klappt, ist das Bild vielleicht zu unscharf oder zu dunkel.
        </div>
      ) : null}
      {!reviewed && !running ? (
        <div className="notice" role="status">
          Dieses Dokument wurde noch nicht geprüft. Fristen und Erinnerungen gibt es erst danach.{" "}
          <button className="dx-link" onClick={() => go("review", { doc: id })}>
            Jetzt prüfen
          </button>
        </div>
      ) : null}

      <div className="dx-cols">
        <div style={{ position: "sticky", top: "1rem", minWidth: 0 }}>
          <Viewer doc={d} />
        </div>
        <div className="stack" style={{ minWidth: 0 }}>
          <div className="card">
            <h2>Angaben</h2>
            <dl className="dx-dl">
              <InlineEdit<string>
                label="Art"
                initial={d.doc_type ?? ""}
                view={d.doc_type ?? <span className="muted">Nicht angegeben</span>}
                editor={(v, set, i) => (
                  <select id={i} value={v} onChange={(e) => set(e.target.value)}>
                    <option value="">Nicht angegeben</option>
                    {(meta.data?.doc_types ?? []).map((t: string) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                )}
                save={(v) => patch({ doc_type: v || null })}
              />
              <InlineEdit<CompanyDraft>
                label="Firma"
                initial={{ id: d.company_id ? String(d.company_id) : "", name: "" }}
                view={d.company_name ?? <span className="muted">Nicht angegeben</span>}
                editor={(v, set, i) => <CompanyEditor draft={v} set={set} id={i} />}
                save={async (v) => {
                  if (v.id === "__new") {
                    const name = v.name.trim();
                    if (name.length < 2) throw new ApiError(400, { code: "ungueltig", message: "Bitte gib einen Namen für die neue Firma ein." });
                    const c = await api.post<{ id: number }>("/api/companies", { name });
                    return patch({ company_id: c.id });
                  }
                  return patch({ company_id: v.id ? Number(v.id) : null });
                }}
              />
              <InlineEdit<string>
                label="Bereich"
                initial={d.category_id ? String(d.category_id) : ""}
                view={d.category_name ?? <span className="muted">Nicht angegeben</span>}
                editor={(v, set, i) => (
                  <select id={i} value={v} onChange={(e) => set(e.target.value)}>
                    <option value="">Nicht angegeben</option>
                    {(categories.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                save={(v) => patch({ category_id: v ? Number(v) : null })}
              />
              <InlineEdit<string>
                label="Datum"
                initial={d.doc_date ?? ""}
                view={d.doc_date ? <span className="mono">{date(d.doc_date)}</span> : <span className="muted">Nicht angegeben</span>}
                editor={(v, set, i) => <input id={i} type="date" value={v} onChange={(e) => set(e.target.value)} />}
                save={(v) => patch({ doc_date: v || null })}
              />
              <InlineEdit<string>
                label="Betrag"
                initial={centsToInput(d.amount_cents)}
                view={d.amount_cents != null ? <span className="mono">{eur(d.amount_cents)}</span> : <span className="muted">Nicht angegeben</span>}
                editor={(v, set, i) => (
                  <input id={i} inputMode="decimal" className="mono" value={v} placeholder="z. B. 129,90" onChange={(e) => set(e.target.value)} />
                )}
                save={(v) => {
                  if (!v.trim()) return patch({ amount_cents: null });
                  const cents = parseEuro(v);
                  if (cents === null) throw new ApiError(400, { code: "ungueltig", message: "Dieser Betrag ist nicht lesbar. Schreibe ihn so: 129,90" });
                  return patch({ amount_cents: cents });
                }}
              />
              <InlineEdit<string>
                label="Notiz"
                initial={d.note ?? ""}
                view={d.note ? <span style={{ whiteSpace: "pre-wrap" }}>{d.note}</span> : <span className="muted">Keine Notiz</span>}
                editor={(v, set, i) => <textarea id={i} rows={3} value={v} maxLength={2000} onChange={(e) => set(e.target.value)} />}
                save={(v) => patch({ note: v.trim() || null })}
              />
              <div>
                <dt>Datei</dt>
                <dd className="mono" style={{ fontSize: "0.8125rem" }}>
                  {d.original_name}
                </dd>
                <dd />
              </div>
              <div>
                <dt>Importiert</dt>
                <dd>{dateTime(d.imported_at)}</dd>
                <dd />
              </div>
              <div>
                <dt>Seiten</dt>
                <dd>
                  {parts.length} · {bytes(parts.reduce((s, p) => s + (p.size ?? 0), 0))}
                </dd>
                <dd />
              </div>
              <div>
                <dt>Stand</dt>
                <dd>{STATE_LABEL[d.state] ?? d.state}</dd>
                <dd />
              </div>
            </dl>
          </div>

          {reviewed && payable ? (
            <div className="card">
              <h2>Bezahlt?</h2>
              {d.paid ? (
                <div className="row spread wrap">
                  <Badge tone="green">✓ Bezahlt{d.paid_at ? ` am ${date(d.paid_at)}` : ""}</Badge>
                  <button className="btn secondary small" disabled={paid.isPending} onClick={() => paid.mutate({ paid: false })}>
                    Wieder als offen markieren
                  </button>
                </div>
              ) : (
                <div className="row spread wrap">
                  <Badge tone="yellow">○ Noch offen</Badge>
                  <button className="btn primary small" onClick={() => setPaying(true)}>
                    Als bezahlt markieren
                  </button>
                </div>
              )}
            </div>
          ) : null}

          <TagsCard doc={d} />
          <RefsCard doc={d} />
          <DeadlinesCard doc={d} />
          <LinksCard doc={d} />
          <OcrCard docId={id} />
          <HistoryCard doc={d} />
        </div>
      </div>

      {archiving ? (
        <Modal
          title="Dokument archivieren?"
          onClose={closeArchive}
          actions={
            <>
              <button className="btn ghost" onClick={closeArchive}>
                Abbrechen
              </button>
              <button className="btn primary" disabled={archive.isPending || reason.trim().length < 2} onClick={() => archive.mutate()}>
                Archivieren
              </button>
            </>
          }
        >
          <p>Das Dokument bleibt gespeichert, erscheint aber nicht mehr in Fristen und Erinnerungen. Du kannst es jederzeit wiederherstellen.</p>
          <div className="field">
            <label htmlFor="arch-reason">Warum archivierst du es?</label>
            <input id="arch-reason" value={reason} maxLength={200} placeholder="z. B. Vertrag gekündigt" onChange={(e) => setReason(e.target.value)} />
          </div>
        </Modal>
      ) : null}
      {paying ? (
        <Modal
          title="Als bezahlt markieren"
          onClose={closePay}
          actions={
            <>
              <button className="btn ghost" onClick={closePay}>
                Abbrechen
              </button>
              <button className="btn primary" disabled={!paidAt || paid.isPending} onClick={() => paid.mutate({ paid: true, paid_at: paidAt })}>
                Als bezahlt markieren
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="paid-at">Bezahlt am</label>
            <input id="paid-at" type="date" value={paidAt} max={todayIso()} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
