import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "../../lib/api";
import { useUi } from "../ui";
import { type Tag } from "./common";

const PALETTE: [string, string][] = [
  ["#3b82f6", "Blau"],
  ["#10b981", "Grün"],
  ["#f59e0b", "Gelb"],
  ["#ef4444", "Rot"],
  ["#a78bfa", "Violett"],
  ["#ec4899", "Pink"],
  ["#14b8a6", "Türkis"],
  ["#9ca3af", "Grau"],
];

export function ColorPick({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="row wrap" role="group" aria-label="Farbe">
      {PALETTE.map(([c, name]) => (
        <button
          key={c}
          type="button"
          className="chip"
          aria-pressed={value.toLowerCase() === c}
          title={name}
          aria-label={name}
          onClick={() => onChange(c)}
          style={{ minWidth: "2.75rem", minHeight: "2.75rem", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
        >
          <span style={{ width: "1.1rem", height: "1.1rem", borderRadius: "50%", background: c, display: "inline-block" }} />
        </button>
      ))}
      <input
        type="color"
        className="dx-swatch"
        aria-label="Eigene Farbe wählen"
        title="Eigene Farbe"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Legt einen neuen Tag an und meldet ihn zurueck. */
export function NewTagForm({ onCreated, label = "Tag anlegen" }: { onCreated?: (t: Tag) => void; label?: string }) {
  const qc = useQueryClient();
  const { toast } = useUi();
  const uid = useId();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const create = useMutation({
    mutationFn: () => api.post<Tag>("/api/tags", { name: name.trim(), color }),
    onSuccess: (t) => {
      setName("");
      void qc.invalidateQueries({ queryKey: ["tags"] });
      onCreated?.(t);
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  return (
    <form
      className="stack"
      style={{ gap: "0.75rem" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) create.mutate();
      }}
    >
      <div className="row wrap" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: "10rem" }}>
          <label htmlFor={`${uid}-n`}>Name des neuen Tags</label>
          <input id={`${uid}-n`} value={name} maxLength={40} placeholder="z. B. Steuer 2026" onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn secondary" type="submit" disabled={!name.trim() || create.isPending}>
          {label}
        </button>
      </div>
      <ColorPick value={color} onChange={setColor} />
    </form>
  );
}
