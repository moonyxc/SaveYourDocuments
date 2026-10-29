import { useEffect, useState } from "react";
import { mediaUrl, type Json } from "../../lib/api";
import { bytes } from "../../lib/format";
import { mimeKind } from "./common";

/** Originaldatei: Bilder direkt, PDFs im Rahmen, andere Formate als kleine Vorschau. */
export default function Viewer({ doc }: { doc: Json }) {
  const parts: Json[] = doc.parts ?? [];
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [broken, setBroken] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (index >= parts.length) setIndex(0);
  }, [parts.length, index]);

  const part = parts[index];
  if (!part) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Zu diesem Dokument ist keine Datei gespeichert.
        </p>
      </div>
    );
  }
  const file = mediaUrl(`/api/documents/${doc.id}/parts/${part.page}/file`);
  const thumb = mediaUrl(`/api/documents/${doc.id}/thumbnails/${part.page}`);
  const kind = mimeKind(part.mime);
  const asImage = kind === "image" && !broken[part.page];
  const multi = parts.length > 1;

  return (
    <div className="card dx-viewer">
      <div className="row spread wrap" style={{ marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0 }}>Original</h2>
        <div className="row wrap">
          {multi ? (
            <>
              <button className="btn ghost small" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Vorherige Seite">
                ←
              </button>
              <span className="muted" role="status">
                Seite {index + 1} von {parts.length}
              </span>
              <button className="btn ghost small" disabled={index >= parts.length - 1} onClick={() => setIndex(index + 1)} aria-label="Nächste Seite">
                →
              </button>
            </>
          ) : null}
          {asImage ? (
            <button className="btn ghost small" aria-pressed={zoom} onClick={() => setZoom((z) => !z)}>
              {zoom ? "Einpassen" : "Vergrößern"}
            </button>
          ) : null}
        </div>
      </div>
      <div className={`dx-stage ${zoom ? "zoom" : ""}`} tabIndex={0} aria-label="Vorschau des Originals">
        {kind === "pdf" ? (
          <iframe src={file} title={`PDF: ${part.name}`} />
        ) : asImage ? (
          <img src={file} alt={`Original, Seite ${index + 1}: ${doc.display_name}`} onError={() => setBroken((b) => ({ ...b, [part.page]: true }))} />
        ) : (
          <img src={thumb} alt={`Vorschau, Seite ${index + 1}: ${doc.display_name}`} />
        )}
      </div>
      {!asImage && kind !== "pdf" ? (
        <p className="hint">Dieses Format kann der Browser nicht in voller Größe zeigen. Du siehst eine kleine Vorschau. Lade das Original herunter, um es zu öffnen.</p>
      ) : null}
      {multi ? (
        <div className="dx-strip" role="group" aria-label="Seiten">
          {parts.map((p, i) => (
            <button key={p.page} aria-pressed={i === index} onClick={() => setIndex(i)} aria-label={`Seite ${i + 1} anzeigen`}>
              <img src={mediaUrl(`/api/documents/${doc.id}/thumbnails/${p.page}`)} alt="" loading="lazy" />
              {i + 1}
            </button>
          ))}
        </div>
      ) : null}
      <div className="row wrap" style={{ marginTop: "0.75rem" }}>
        <a className="btn secondary" href={mediaUrl(`/api/documents/${doc.id}/parts/${part.page}/file`, { download: true })} download>
          {multi ? `Seite ${index + 1} herunterladen` : "Original herunterladen"}
        </a>
        <span className="muted mono" style={{ fontSize: "0.8125rem" }}>
          {part.name} · {bytes(part.size)}
        </span>
      </div>
    </div>
  );
}
