import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "../../lib/api";
import { useUi } from "../ui";

type UploadResult = { batch_id: number | null; files: number; rejected: { name: string; reason: string }[] };

const MAX_FILES = 200;
const ACCEPT = "image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.tif,.tiff";

export function UploadZone() {
  const qc = useQueryClient();
  const { toast } = useUi();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<UploadResult["rejected"]>([]);

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      if (files.length > MAX_FILES) {
        throw new Error(`Das sind zu viele Dateien auf einmal. Wähle höchstens ${MAX_FILES} aus und wiederhole den Vorgang.`);
      }
      const form = new FormData();
      for (const f of files) form.append("files", f, f.name);
      return api.upload<UploadResult>("/api/import/upload", form);
    },
    onSuccess: (r) => {
      setRejected(r.rejected);
      if (r.files > 0) {
        toast(r.files === 1 ? "1 Datei angenommen. Sortiere sie unten." : `${r.files} Dateien angenommen. Sortiere sie unten.`);
      } else {
        toast("Keine der Dateien konnte angenommen werden.", "bad");
      }
      void qc.invalidateQueries({ queryKey: ["import"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast(e instanceof Error && !("code" in e) ? e.message : errorText(e), "bad"),
  });

  const take = (list: FileList | null) => {
    const files = list ? [...list] : [];
    if (files.length) upload.mutate(files);
    if (input.current) input.current.value = "";
  };

  return (
    <div>
      <div
        className={`drop imp-drop ${over ? "over" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
      >
        <strong>Fotos und PDFs hierher ziehen</strong>
        <div>
          <button className="btn secondary" disabled={upload.isPending} onClick={() => input.current?.click()}>
            {upload.isPending ? "Wird hochgeladen …" : "Dateien auswählen"}
          </button>
        </div>
        <div className="hint">Erlaubt sind JPG, PNG, HEIC, WebP, TIFF und PDF. Die Originale bleiben unverändert.</div>
        <label className="sr" htmlFor="imp-file">
          Dateien auswählen
        </label>
        <input
          id="imp-file"
          ref={input}
          className="sr"
          type="file"
          multiple
          accept={ACCEPT}
          tabIndex={-1}
          onChange={(e) => take(e.target.files)}
        />
      </div>
      {rejected.length ? (
        <div className="notice bad" role="alert" style={{ marginTop: "1rem" }}>
          <div className="row spread">
            <strong>
              {rejected.length === 1 ? "1 Datei wurde nicht angenommen" : `${rejected.length} Dateien wurden nicht angenommen`}
            </strong>
            <button className="btn ghost small" onClick={() => setRejected([])}>
              Hinweis schließen
            </button>
          </div>
          <ul className="imp-rejected">
            {rejected.map((r, i) => (
              <li key={i}>
                <span className="mono">{r.name}</span>: {r.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
