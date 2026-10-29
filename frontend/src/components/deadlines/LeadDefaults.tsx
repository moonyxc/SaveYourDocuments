import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText, type Json } from "../../lib/api";
import { ErrorBox, Field, Spinner, useUi } from "../ui";
import { DEADLINE_TYPES, parseLeads, typeLabel } from "./common";

const FALLBACK: Record<string, number[]> = {
  zahlungsziel: [7, 1],
  vertragsende: [30, 7],
  kuendigungsfrist: [30, 7],
  sonstige: [7, 1],
};

/** Standard-Erinnerungsvorlauf pro Fristart. */
export function LeadDefaults() {
  const { toast } = useUi();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["reminder-defaults"], queryFn: () => api.get<Record<string, number[]>>("/api/reminder-defaults") });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");

  const saved = (t: string) => (q.data?.[t] ?? FALLBACK[t]).join(", ");
  const value = (t: string) => draft[t] ?? saved(t);
  const dirty = DEADLINE_TYPES.filter((t) => draft[t] !== undefined && draft[t].trim() !== saved(t));

  const save = useMutation({
    mutationFn: (body: Json) => api.put("/api/reminder-defaults", body),
    onSuccess: () => {
      setDraft({});
      setProblem("");
      toast("Der Standard-Vorlauf ist gespeichert. Er gilt für neue Fristen.");
      void qc.invalidateQueries({ queryKey: ["reminder-defaults"] });
    },
    onError: (e) => setProblem(errorText(e)),
  });

  const submit = () => {
    const body: Record<string, number[]> = {};
    for (const t of dirty) {
      const parsed = parseLeads(draft[t]);
      if (parsed === null) {
        setProblem(`${typeLabel(t)}: Bitte ganze Tage zwischen 0 und 365 eintragen, zum Beispiel „7, 1“.`);
        return;
      }
      body[t] = parsed;
    }
    save.mutate(body);
  };

  return (
    <section className="card" aria-labelledby="lead-title">
      <h2 id="lead-title">Standard-Erinnerungsvorlauf</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        So viele Tage vor einer Frist erinnert dich das Programm. Mehrere Werte mit Komma trennen. Die Einstellung gilt für neue
        Fristen. Bereits bestätigte Fristen kannst du einzeln anpassen.
      </p>
      {q.isLoading ? <Spinner /> : null}
      {q.isError ? <ErrorBox error={q.error} retry={() => void q.refetch()} /> : null}
      {q.data ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid-gap g2">
            {DEADLINE_TYPES.map((t) => (
              <Field key={t} label={typeLabel(t)} htmlFor={`lead-${t}`}>
                <input id={`lead-${t}`} inputMode="numeric" value={value(t)} onChange={(e) => setDraft({ ...draft, [t]: e.target.value })} />
              </Field>
            ))}
          </div>
          {problem ? (
            <div className="notice bad" role="alert" style={{ marginBottom: "1rem" }}>
              {problem}
            </div>
          ) : null}
          <div className="row wrap">
            <button className="btn primary" type="submit" disabled={!dirty.length || save.isPending}>
              Vorlauf speichern
            </button>
            {dirty.length ? (
              <button className="btn ghost" type="button" onClick={() => (setDraft({}), setProblem(""))}>
                Änderungen verwerfen
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}
