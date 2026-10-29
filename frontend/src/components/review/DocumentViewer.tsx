import { useState } from "react";
import { mediaUrl } from "../../lib/api";
import { bytes } from "../../lib/format";
import { Badge } from "../ui";
import type { Part } from "./types";

const ZOOMS = [1, 1.5, 2, 3];

function Page({ docId, part, zoom }: { docId: number; part: Part; zoom: number }) {
  const [broken, setBroken] = useState(false);
  const file = mediaUrl(`/api/documents/${docId}/parts/${part.page}/file`);
  const thumb = mediaUrl(`/api/documents/${docId}/thumbnails/${part.page}`);
  const isPdf = part.mime === "application/pdf";
  const canShow = part.mime.startsWith("image/") && part.mime !== "image/heic" && part.mime !== "image/heif";

  if (isPdf) {
    return (
      <div className="rv-stage">
        <iframe src={file} title={`Original, Seite ${part.page}`} />
      </div>
    );
  }
  const fit = zoom === 1;
  return (
    <div className={`rv-stage ${fit ? "fit" : ""}`} tabIndex={0} aria-label={`Original, Seite ${part.page}. Mit den Pfeiltasten scrollen.`}>
      <img
        src={canShow && !broken ? file : thumb}
        alt={`Original, Seite ${part.page}`}
        style={fit ? undefined : { width: `${zoom * 100}%`, maxWidth: "none" }}
        onError={() => setBroken(true)}
      />
    </div>
  );
}

export function DocumentViewer({ docId, parts }: { docId: number; parts: Part[] }) {
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(1);

  const part = parts[Math.min(idx, parts.length - 1)];
  const heic = part && (part.mime === "image/heic" || part.mime === "image/heif");
  const zi = ZOOMS.indexOf(zoom);

  return (
    <div className="card">
      <div className="row spread wrap" style={{ marginBottom: "0.75rem" }}>
        <span className="label">{parts.length === 1 ? "1 Seite" : `${parts.length} Seiten`}</span>
        <Badge tone="gray">✓ Original unverändert gespeichert</Badge>
      </div>

      {parts.length > 1 ? (
        <div className="rv-strip" role="group" aria-label="Seiten">
          {parts.map((p, i) => (
            <button key={p.page} aria-current={i === idx} aria-label={`Seite ${i + 1} anzeigen`} onClick={() => setIdx(i)}>
              <img src={mediaUrl(`/api/documents/${docId}/thumbnails/${p.page}`)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
              Seite {i + 1}
            </button>
          ))}
        </div>
      ) : null}

      {part ? <Page key={`${docId}-${part.page}`} docId={docId} part={part} zoom={zoom} /> : <div className="empty">Zu diesem Dokument gibt es keine Seiten.</div>}

      {part ? (
        <>
          <div className="rv-tools">
            {parts.length > 1 ? (
              <>
                <button className="btn secondary" disabled={idx === 0} onClick={() => setIdx(idx - 1)} aria-label="Vorherige Seite">
                  ‹
                </button>
                <span className="muted" aria-live="polite">
                  Seite {idx + 1} von {parts.length}
                </span>
                <button className="btn secondary" disabled={idx >= parts.length - 1} onClick={() => setIdx(idx + 1)} aria-label="Nächste Seite">
                  ›
                </button>
              </>
            ) : null}
            {part.mime !== "application/pdf" ? (
              <span className="row" style={{ marginLeft: "auto", gap: "0.5rem" }} role="group" aria-label="Zoom">
                <button className="btn secondary" disabled={zi <= 0} onClick={() => setZoom(ZOOMS[Math.max(0, zi - 1)])} aria-label="Verkleinern">
                  −
                </button>
                <button className="btn secondary" disabled={zoom === 1} onClick={() => setZoom(1)}>
                  Einpassen
                </button>
                <button className="btn secondary" disabled={zi >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zi + 1)])} aria-label="Vergrößern">
                  +
                </button>
              </span>
            ) : null}
            <a
              className="btn ghost"
              style={part.mime !== "application/pdf" ? undefined : { marginLeft: "auto" }}
              href={mediaUrl(`/api/documents/${docId}/parts/${part.page}/file`, { download: true })}
              download
            >
              Original herunterladen
            </a>
          </div>
          <div className="hint">
            {part.name ? <span className="mono">{part.name}</span> : null} · {bytes(part.size)}
            {heic ? " · Dieses Format zeigt der Browser nur verkleinert an. Das Original ist unverändert." : ""}
          </div>
        </>
      ) : null}
    </div>
  );
}
