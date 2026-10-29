import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "../../lib/api";
import { date } from "../../lib/format";
import { useUi } from "../ui";
import { LINK_CHOICE, LINK_LABEL, type DocLink } from "./types";

function other(l: DocLink): string {
  const o = l.other;
  return [o.company_name, o.doc_type, o.doc_date ? `vom ${date(o.doc_date)}` : null].filter(Boolean).join(" · ") || o.original_name;
}

function Suggestion({ link, docId }: { link: DocLink; docId: number }) {
  const qc = useQueryClient();
  const { toast } = useUi();
  const [type, setType] = useState(link.type);
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["document", docId] });
  };
  const confirm = useMutation({
    mutationFn: () => api.post(`/api/links/${link.id}/confirm`, { link_type: type }),
    onSuccess: () => {
      toast("Verknüpft.");
      done();
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  const reject = useMutation({
    mutationFn: () => api.post(`/api/links/${link.id}/reject`),
    onSuccess: () => {
      toast("Alles klar, die beiden bleiben getrennt.");
      done();
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  const sentence =
    link.direction === "ausgehend"
      ? `Dieses Dokument ${LINK_LABEL[type] ?? type} ${other(link)}.`
      : `${other(link)} ${LINK_LABEL[type] ?? type} dieses Dokument.`;
  const busy = confirm.isPending || reject.isPending;
  const sel = `link-type-${link.id}`;
  return (
    <div className="suggest" role="group" aria-label="Vorschlag zum Verknüpfen">
      <strong>Gehört das zusammen?</strong>
      <p>{sentence}</p>
      {link.reason ? <p className="muted rv-small" style={{ marginTop: "-0.5rem" }}>Grund: {link.reason}</p> : null}
      <div className="field" style={{ marginBottom: "0.75rem" }}>
        <label htmlFor={sel}>Wie hängen sie zusammen?</label>
        <select id={sel} value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(LINK_CHOICE).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="row wrap">
        <button className="btn secondary" type="button" disabled={busy} onClick={() => confirm.mutate()}>
          Ja, verknüpfen
        </button>
        <button className="btn ghost" type="button" disabled={busy} onClick={() => reject.mutate()}>
          Nein
        </button>
      </div>
    </div>
  );
}

export function LinkSuggestions({ links, docId, onOpen }: { links: DocLink[]; docId: number; onOpen: (id: number) => void }) {
  const suggested = links.filter((l) => l.status === "vorgeschlagen");
  const confirmed = links.filter((l) => l.status === "bestaetigt");
  if (!links.length) return null;
  return (
    <div className="rv-sect">
      {suggested.map((l) => (
        <Suggestion key={`${l.id}-${l.type}`} link={l} docId={docId} />
      ))}
      {confirmed.length > 0 ? (
        <div className="card">
          <h3>Verknüpfte Dokumente</h3>
          <ul className="list">
            {confirmed.map((l) => (
              <li className="item" key={l.id}>
                <div className="grow rv-small">
                  {l.direction === "ausgehend" ? `Dieses Dokument ${LINK_LABEL[l.type] ?? l.type} ` : `${LINK_LABEL[l.type] ?? l.type}: `}
                  <strong>{other(l)}</strong>
                </div>
                <button className="btn ghost small" type="button" onClick={() => onOpen(l.other.id)}>
                  Ansehen
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
