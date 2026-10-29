import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorText, mediaUrl } from "../../lib/api";
import { bytes, dateTime } from "../../lib/format";
import { Badge, Modal, useUi } from "../ui";

export type ImportFile = { id: number; name: string; size: number; mime: string; sha256: string; state: string };
export type PendingBatch = {
  id: number;
  source: "upload" | "localsend";
  device_alias: string | null;
  received_at: string;
  files: ImportFile[];
};
export type CommitResult = { created: number[]; duplicates: number[]; archived: number[] };

type Sort = { groups: number[][]; discard: number[] };

// Die Sortierung bleibt erhalten, wenn man die Ansicht kurz verlaesst.
const memory = new Map<number, Sort>();

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const fileUrl = (id: number) => mediaUrl(`/api/import/files/${id}`);
const isImage = (f: ImportFile) => f.mime.startsWith("image/") && f.mime !== "image/heic" && f.mime !== "image/heif";
const mimeLabel = (f: ImportFile) => (f.mime === "application/pdf" ? "PDF" : f.mime.replace("image/", "").toUpperCase());

function Pic({ file, className }: { file: ImportFile; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!isImage(file) || broken) {
    return (
      <div className={`imp-ph ${className ?? ""}`} aria-hidden="true">
        <b>{mimeLabel(file)}</b>
        <span>{file.mime === "application/pdf" ? "Keine Vorschau" : "Vorschau nicht möglich"}</span>
      </div>
    );
  }
  return <img src={fileUrl(file.id)} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />;
}

function Preview({ file, label, onClose }: { file: ImportFile; label: string; onClose: () => void }) {
  return (
    <Modal title={label} wide onClose={onClose} actions={<button className="btn primary" onClick={onClose}>Schließen</button>}>
      <p className="muted" style={{ marginTop: 0 }}>
        <span className="mono">{file.name}</span> · {bytes(file.size)}
      </p>
      {isImage(file) ? (
        <img className="imp-preview" src={fileUrl(file.id)} alt={`Großansicht von ${label}`} />
      ) : file.mime === "application/pdf" ? (
        <iframe className="imp-preview-pdf" src={fileUrl(file.id)} title={`Großansicht von ${label}`} />
      ) : (
        <div className="notice">Dieses Format kann hier nicht angezeigt werden. Es wird beim Erkennen trotzdem gelesen.</div>
      )}
    </Modal>
  );
}

export function BatchSorter({
  batch,
  trusted,
  onDone,
}: {
  batch: PendingBatch;
  trusted: boolean;
  onDone: (r: CommitResult, label: string) => void;
}) {
  const qc = useQueryClient();
  const { toast, confirm } = useUi();
  const [sort, setSortState] = useState<Sort>(() => memory.get(batch.id) ?? { groups: [], discard: [] });
  const [sel, setSel] = useState<number[]>([]);
  const [preview, setPreview] = useState<number | null>(null);

  const setSort = (fn: (s: Sort) => Sort) =>
    setSortState((s) => {
      const next = fn(s);
      memory.set(batch.id, next);
      return next;
    });

  const byId = useMemo(() => new Map(batch.files.map((f) => [f.id, f])), [batch.files]);
  const order = useMemo(() => new Map(batch.files.map((f, i) => [f.id, i])), [batch.files]);
  const groups = sort.groups.map((g) => g.filter((id) => byId.has(id))).filter((g) => g.length);
  const discard = sort.discard.filter((id) => byId.has(id));
  const used = new Set([...groups.flat(), ...discard]);
  const free = batch.files.filter((f) => !used.has(f.id));
  const selection = sel.filter((id) => !used.has(id) && byId.has(id));
  const nr = (id: number) => (order.get(id) ?? 0) + 1;

  const firstSeen = new Map<string, number>();
  const sameAs = new Map<number, number>();
  for (const f of batch.files) {
    const first = firstSeen.get(f.sha256);
    if (first === undefined) firstSeen.set(f.sha256, f.id);
    else sameAs.set(f.id, first);
  }

  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const groupSelected = () => {
    const ids = [...selection].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    setSort((s) => ({ ...s, groups: [...groups, ids], discard }));
    setSel([]);
  };
  const singles = (ids: number[]) => {
    setSort((s) => ({ ...s, groups: [...groups, ...ids.map((id) => [id])], discard }));
    setSel([]);
  };
  const move = (gi: number, i: number, d: -1 | 1) =>
    setSort((s) => {
      const next = groups.map((g) => [...g]);
      const g = next[gi];
      [g[i], g[i + d]] = [g[i + d], g[i]];
      return { ...s, groups: next, discard };
    });
  const release = (gi: number, id: number) =>
    setSort((s) => ({ ...s, groups: groups.map((g, i) => (i === gi ? g.filter((x) => x !== id) : g)).filter((g) => g.length), discard }));
  const dissolve = (gi: number) => setSort((s) => ({ ...s, groups: groups.filter((_, i) => i !== gi), discard }));
  const throwOut = async (id: number) => {
    const ok = await confirm({
      title: `Foto ${nr(id)} aussortieren?`,
      text: "Die Datei kommt nicht in die Prüfung. Sie wird im Archiv aufbewahrt und ist nicht gelöscht. Du findest sie unter Dokumente im Archiv.",
      confirmLabel: "Aussortieren",
      danger: true,
    });
    if (!ok) return;
    setSort((s) => ({ ...s, groups, discard: [...discard, id] }));
    setSel((x) => x.filter((y) => y !== id));
    setPreview(null);
  };
  const takeBack = (id: number) => setSort((s) => ({ ...s, groups, discard: discard.filter((x) => x !== id) }));

  const label = batch.source === "localsend" ? `Von „${batch.device_alias ?? "Unbekanntes Gerät"}“` : "Vom Computer hochgeladen";

  const commit = useMutation({
    mutationFn: () => api.post<CommitResult>(`/api/import/${batch.id}/commit`, { groups, discard }),
    onSuccess: (r) => {
      memory.delete(batch.id);
      onDone(r, label);
      void qc.invalidateQueries();
    },
    onError: (e) => toast(errorText(e), "bad"),
  });

  const ready = free.length === 0 && (groups.length > 0 || discard.length > 0);
  const docCount = groups.length;
  const previewFile = preview !== null ? byId.get(preview) : undefined;

  return (
    <section className="card" aria-label={`${label}, ${batch.files.length} Dateien`}>
      <div className="row spread wrap">
        <div>
          <h2 style={{ margin: 0 }}>
            {label} · {batch.files.length} {plural(batch.files.length, "Datei", "Dateien")}
          </h2>
          <div className="muted" style={{ fontSize: "0.875rem" }}>
            Angekommen {dateTime(batch.received_at)}
          </div>
        </div>
        {batch.source === "localsend" ? (
          trusted ? <Badge tone="green">✓ Gerät vertraut</Badge> : <Badge tone="gray">Gerät einmalig angenommen</Badge>
        ) : (
          <Badge tone="blue">Vom Computer</Badge>
        )}
      </div>

      {free.length > 0 ? (
        <>
          <p className="muted" style={{ margin: "1rem 0 0.75rem" }}>
            Tippe die Fotos an, die zu <strong style={{ color: "var(--text-primary)" }}>einem</strong> Dokument gehören, und fasse sie zusammen. Fotos
            ohne Auswahl bleiben einzelne Dokumente.
          </p>
          <div className="imp-tiles">
            {free.map((f) => {
              const on = selection.includes(f.id);
              return (
                <div className="imp-tile" key={f.id}>
                  <button
                    className="thumb"
                    aria-pressed={on}
                    aria-label={`Foto ${nr(f.id)}, ${f.name}, ${on ? "ausgewählt" : "nicht ausgewählt"}`}
                    onClick={() => toggle(f.id)}
                  >
                    <Pic file={f} />
                    <div className="cap">
                      <span>
                        {nr(f.id)} · {f.name}
                      </span>
                      <span>{on ? "✓ gewählt" : ""}</span>
                    </div>
                  </button>
                  {sameAs.has(f.id) ? <span className="imp-dupe">▲ Gleich wie Foto {nr(sameAs.get(f.id)!)}</span> : null}
                  <div className="imp-tile-actions">
                    <button className="btn secondary" onClick={() => setPreview(f.id)} aria-label={`Foto ${nr(f.id)} groß ansehen`}>
                      Ansehen
                    </button>
                    <button className="btn ghost" onClick={() => void throwOut(f.id)} aria-label={`Foto ${nr(f.id)} aussortieren`}>
                      Aussortieren
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="row wrap" style={{ marginTop: "1rem" }}>
            <button className="btn primary" disabled={selection.length < 2} onClick={groupSelected}>
              Auswahl zu einem Dokument zusammenfassen
            </button>
            <button className="btn secondary" disabled={selection.length < 1} onClick={() => singles(selection)}>
              Auswahl einzeln lassen
            </button>
            <button className="btn ghost" onClick={() => setSel(sel.length === free.length ? [] : free.map((f) => f.id))}>
              {selection.length === free.length ? "Auswahl aufheben" : "Alle auswählen"}
            </button>
            <span className="muted" role="status">
              {selection.length ? `${selection.length} ausgewählt` : "Noch nichts ausgewählt."}
            </span>
          </div>
          <div className="row wrap" style={{ marginTop: "0.5rem" }}>
            <button className="btn ghost" onClick={() => singles(free.map((f) => f.id))}>
              Alle übrigen einzeln lassen ({free.length})
            </button>
          </div>
        </>
      ) : null}

      {groups.length > 0 ? (
        <div style={{ marginTop: "1.5rem" }}>
          <h3>
            Sortiert: {docCount} {plural(docCount, "Dokument", "Dokumente")}
          </h3>
          {groups.map((g, gi) => (
            <div className="imp-group" key={g.join("-")}>
              <div className="row spread wrap">
                <strong style={{ color: "var(--text-primary)" }}>
                  Dokument {gi + 1}{" "}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    · {g.length} {plural(g.length, "Seite", "Seiten")}
                  </span>
                </strong>
                <button className="btn ghost small" onClick={() => dissolve(gi)}>
                  Auflösen
                </button>
              </div>
              <div className="imp-pages" role="list" aria-label={`Seiten von Dokument ${gi + 1}`}>
                {g.map((id, i) => {
                  const f = byId.get(id)!;
                  return (
                    <div className="imp-page" key={id} role="listitem">
                      <Pic file={f} />
                      <div className="num">
                        Seite {i + 1} <span className="muted">(Foto {nr(id)})</span>
                      </div>
                      <div className="imp-page-actions">
                        <button
                          className="btn secondary"
                          disabled={i === 0}
                          onClick={() => move(gi, i, -1)}
                          aria-label={`Seite ${i + 1} nach vorn schieben`}
                          title="Nach vorn"
                        >
                          ‹
                        </button>
                        <button
                          className="btn secondary"
                          disabled={i === g.length - 1}
                          onClick={() => move(gi, i, 1)}
                          aria-label={`Seite ${i + 1} nach hinten schieben`}
                          title="Nach hinten"
                        >
                          ›
                        </button>
                        <button className="btn ghost wide" onClick={() => release(gi, id)} aria-label={`Foto ${nr(id)} aus Dokument ${gi + 1} lösen`}>
                          Herauslösen
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {discard.length > 0 ? (
        <div style={{ marginTop: "1.5rem" }}>
          <h3>Aussortiert: {discard.length}</h3>
          <ul className="list">
            {discard.map((id) => (
              <li className="item" key={id}>
                <div className="grow">
                  <span className="mono">{byId.get(id)?.name}</span> <span className="muted">(Foto {nr(id)})</span>
                </div>
                <button className="btn ghost small" onClick={() => takeBack(id)}>
                  Zurücknehmen
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="row wrap" style={{ marginTop: "1.5rem" }}>
        <button className="btn primary" disabled={!ready || commit.isPending} onClick={() => commit.mutate()}>
          {commit.isPending ? "Wird übernommen …" : "Erkennung starten"}
        </button>
        <span className="muted" role="status">
          {free.length > 0
            ? `Sortiere zuerst alle Fotos. Noch ${free.length} ${plural(free.length, "Foto", "Fotos")} offen.`
            : ready
              ? `${docCount} ${plural(docCount, "Dokument", "Dokumente")} bereit${discard.length ? `, ${discard.length} aussortiert` : ""}.`
              : "Es ist nichts zu übernehmen."}
        </span>
      </div>

      {previewFile ? (
        <Preview file={previewFile} label={`Foto ${nr(previewFile.id)}`} onClose={() => setPreview(null)} />
      ) : null}
    </section>
  );
}
