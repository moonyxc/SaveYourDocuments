import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError, errorText } from "../../lib/api";
import { centsToInput, parseEuro } from "../../lib/format";
import { Badge, Field, Modal, Spinner, useUi } from "../ui";
import { CompanyCombobox, type CompanyValue } from "./CompanyCombobox";
import { DeadlineEditor, deadlineSpecs, draftsFromServer, type DeadlineDraft } from "./DeadlineEditor";
import { LinkSuggestions } from "./LinkSuggestions";
import {
  EXTRACTION_NAME,
  REF_LABEL,
  type Category,
  type Company,
  type DocDetail,
  type FieldKey,
  type Tag,
} from "./types";

type RefDraft = { key: string; type: string; value: string };
type Similar = { id: number; name: string; score: number };

type Draft = {
  doc_type: string;
  company: CompanyValue;
  newCompanyOk: boolean;
  category_id: string;
  doc_date: string;
  amount: string;
  note: string;
  paid: boolean;
  tag_ids: number[];
  refs: RefDraft[];
  deadlines: DeadlineDraft[];
  touched: Partial<Record<FieldKey, boolean>>;
};

/** Ungespeicherte Eingaben bleiben beim Blaettern erhalten. */
const drafts = new Map<number, Draft>();
let refSeq = 0;

export function forgetDraft(id: number): void {
  drafts.delete(id);
}

const extraction = (d: DocDetail, k: FieldKey) => d.extractions.find((e) => e.field === EXTRACTION_NAME[k]);

function initDraft(d: DocDetail): Draft {
  const firma = extraction(d, "company");
  return {
    doc_type: d.doc_type ?? extraction(d, "doc_type")?.value ?? "",
    company: { id: d.company_id, name: d.company_name ?? (d.company_id === null ? (firma?.value ?? "") : "") },
    newCompanyOk: false,
    category_id: d.category_id === null ? "" : String(d.category_id),
    doc_date: d.doc_date ?? "",
    amount: centsToInput(d.amount_cents),
    note: d.note ?? "",
    paid: d.paid,
    tag_ids: d.tags.map((t) => t.id),
    refs: d.references.map((r) => ({ key: `r${++refSeq}`, type: r.type, value: r.value })),
    deadlines: draftsFromServer(d.deadlines),
    touched: {},
  };
}

const comparable = (d: Draft) => JSON.stringify({ ...d, touched: undefined, newCompanyOk: undefined });

function OcrText({ docId }: { docId: number }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["document", docId, "text"],
    queryFn: () => api.get<{ pages: { page: number; text: string; confidence: number | null }[] }>(`/api/documents/${docId}/text`),
    enabled: open,
  });
  return (
    <details className="rv-details" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>Erkannten Text anzeigen</summary>
      {open && q.isLoading ? <Spinner /> : null}
      {open && q.error ? <p className="err">{errorText(q.error)}</p> : null}
      {q.data && q.data.pages.every((p) => !p.text.trim()) ? <p className="muted">Es wurde kein Text erkannt.</p> : null}
      {q.data?.pages
        .filter((p) => p.text.trim())
        .map((p) => (
          <div key={p.page}>
            {q.data.pages.length > 1 ? <div className="muted rv-small" style={{ marginTop: "0.5rem" }}>Seite {p.page}</div> : null}
            <pre className="rv-text" tabIndex={0} aria-label={`Erkannter Text, Seite ${p.page}`}>
              {p.text}
            </pre>
          </div>
        ))}
    </details>
  );
}

const ARCHIVE_REASONS = ["Doppelt vorhanden", "Nicht wichtig", "Schlecht lesbar", "Falsch fotografiert"];

function ArchiveDialog({ onClose, onArchive, busy }: { onClose: () => void; onArchive: (reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      title="Dokument archivieren"
      onClose={onClose}
      actions={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn danger" type="button" disabled={!reason.trim() || busy} onClick={() => onArchive(reason.trim())}>
            Archivieren
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Das Dokument verschwindet aus der Liste, wird aber nicht gelöscht. Du findest es im Archiv und kannst es wiederherstellen.
      </p>
      <div className="chips" role="group" aria-label="Häufige Gründe" style={{ marginBottom: "0.75rem" }}>
        {ARCHIVE_REASONS.map((r) => (
          <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>
            {r}
          </button>
        ))}
      </div>
      <Field label="Grund" htmlFor="archive-reason" hint="Pflichtfeld, damit du später weißt, warum.">
        <input
          id="archive-reason"
          value={reason}
          maxLength={200}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && reason.trim() && !busy) {
              e.preventDefault();
              onArchive(reason.trim());
            }
          }}
        />
      </Field>
    </Modal>
  );
}

function ConflictDialog({
  name,
  similar,
  onSame,
  onNew,
  onClose,
}: {
  name: string;
  similar: Similar[];
  onSame: (s: Similar) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Gibt es diese Firma schon?"
      onClose={onClose}
      actions={
        <button className="btn ghost" type="button" onClick={onClose}>
          Zurück
        </button>
      }
    >
      <p style={{ marginTop: 0 }}>
        „{name}“ ist noch nicht angelegt. Es gibt aber ähnliche Firmen. Ist eine davon dieselbe Firma?
      </p>
      <div className="stack" style={{ marginBottom: "1rem" }}>
        {similar.map((s) => (
          <button key={s.id} type="button" className="btn secondary" onClick={() => onSame(s)}>
            Ja, es ist „{s.name}“
          </button>
        ))}
      </div>
      <p className="muted rv-small">Bei „Ja“ merkt sich die App die Schreibweise „{name}“ und ordnet künftige Dokumente automatisch zu.</p>
      <button className="btn primary" type="button" onClick={onNew}>
        Nein, neue Firma „{name}“ anlegen
      </button>
    </Modal>
  );
}

export function ReviewForm({
  detail,
  threshold,
  hasNext,
  onConfirmed,
  onArchived,
  onOpenDoc,
}: {
  detail: DocDetail;
  threshold: number;
  hasNext: boolean;
  onConfirmed: () => void;
  onArchived: () => void;
  onOpenDoc: (id: number) => void;
}) {
  const { toast, confirm } = useUi();
  const docId = detail.id;
  const initial = useRef<Draft>(initDraft(detail));
  const [d, setD] = useState<Draft>(() => drafts.get(docId) ?? initial.current);
  const [errors, setErrors] = useState<{ amount?: string; form?: string }>({});
  const [conflict, setConflict] = useState<{ name: string; similar: Similar[] } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [newCat, setNewCat] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    drafts.set(docId, d);
  }, [docId, d]);

  const companies = useQuery({ queryKey: ["companies"], queryFn: () => api.get<{ items: Company[] }>("/api/companies") });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api.get<{ items: Category[] }>("/api/categories") });
  const tags = useQuery({ queryKey: ["tags"], queryFn: () => api.get<{ items: Tag[] }>("/api/tags") });
  const meta = useQuery({
    queryKey: ["meta"],
    queryFn: () => api.get<{ doc_types: string[]; deadline_types: string[]; reference_types: string[] }>("/api/meta"),
  });
  const defaults = useQuery({
    queryKey: ["reminder-defaults"],
    queryFn: () => api.get<Record<string, number[]>>("/api/reminder-defaults"),
  });

  const docTypes = meta.data?.doc_types ?? [];
  const deadlineTypes = meta.data?.deadline_types ?? ["zahlungsziel", "vertragsende", "kuendigungsfrist", "sonstige"];
  const refTypes = meta.data?.reference_types ?? Object.keys(REF_LABEL);
  const dirty = comparable(d) !== comparable(initial.current);

  const set = (p: Partial<Draft>, touch?: FieldKey) =>
    setD((x) => ({ ...x, ...p, touched: touch ? { ...x.touched, [touch]: true } : x.touched }));

  type Status = { cls: string; tone: "green" | "yellow"; text: string; accept: boolean };
  const status = (k: FieldKey, hasValue: boolean, extra?: { newCompany?: boolean }): Status => {
    const e = extraction(detail, k);
    const c = e?.confidence ?? null;
    if (d.touched[k]) return { cls: "confirmed", tone: "green", text: "✓ von dir bestätigt", accept: false };
    if (!hasValue) return { cls: "unsure", tone: "yellow", text: "▲ nicht gefunden", accept: true };
    if (extra?.newCompany) return { cls: "unsure", tone: "yellow", text: "▲ neue Firma", accept: false };
    if (c !== null && c < threshold) return { cls: "unsure", tone: "yellow", text: `▲ bitte prüfen ${Math.round(c * 100)} %`, accept: true };
    if (c !== null) return { cls: "", tone: "green", text: `✓ sicher ${Math.round(c * 100)} %`, accept: false };
    return { cls: "", tone: "green", text: "✓ eingetragen", accept: false };
  };

  const companyName = d.company.name.trim();
  const sCompany = status("company", !!companyName, { newCompany: !!companyName && d.company.id === null && !d.touched.company });
  const sType = status("doc_type", !!d.doc_type.trim());
  const sCat = status("category", !!d.category_id);
  const sDate = status("doc_date", !!d.doc_date);
  const sAmount = status("amount", !!d.amount.trim());

  const accept = (k: FieldKey) => setD((x) => ({ ...x, touched: { ...x.touched, [k]: true } }));
  const label = (s: Status) => <Badge tone={s.tone}>{s.text}</Badge>;
  const acceptBtn = (k: FieldKey, s: Status) =>
    s.accept ? (
      <div>
        <button className="rv-accept" type="button" onClick={() => accept(k)}>
          Stimmt so
        </button>
      </div>
    ) : null;

  const addTag = useMutation({
    mutationFn: (name: string) => api.post<Tag>("/api/tags", { name }),
    onSuccess: (t, _n, _c) => {
      setNewTag("");
      void tags.refetch();
      setD((x) => (x.tag_ids.includes(t.id) ? x : { ...x, tag_ids: [...x.tag_ids, t.id] }));
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  const addCat = useMutation({
    mutationFn: (name: string) => api.post<Category>("/api/categories", { name }),
    onSuccess: (c) => {
      setNewCat("");
      void categories.refetch();
      set({ category_id: String(c.id) }, "category");
    },
    onError: (e) => toast(errorText(e), "bad"),
  });

  const reprocess = useMutation({
    mutationFn: () => api.post(`/api/documents/${docId}/reprocess`),
    onSuccess: () => {
      drafts.delete(docId);
      toast("Das Dokument wird neu erkannt.");
    },
    onError: (e) => toast(errorText(e), "bad"),
  });
  const archive = useMutation({
    mutationFn: (reason: string) => api.post(`/api/documents/${docId}/archive`, { reason }),
    onSuccess: () => {
      drafts.delete(docId);
      setArchiving(false);
      toast("Archiviert. Du findest das Dokument im Archiv.");
      onArchived();
    },
    onError: (e) => toast(errorText(e), "bad"),
  });

  const askReprocess = async () => {
    if (dirty) {
      const ok = await confirm({
        title: "Neu erkennen?",
        text: "Deine Änderungen an diesem Dokument gehen dabei verloren.",
        confirmLabel: "Neu erkennen",
      });
      if (!ok) return;
    }
    reprocess.mutate();
  };

  type Override = { company?: CompanyValue; createNew?: boolean };

  const submit = async (ov: Override = {}) => {
    if (busy) return;
    setErrors({});
    const company = ov.company ?? d.company;
    const createNew = ov.createNew ?? d.newCompanyOk;
    const name = company.name.trim();

    let amount: number | null = null;
    if (d.amount.trim()) {
      amount = parseEuro(d.amount);
      if (amount === null) {
        setErrors({ amount: "Bitte den Betrag als Zahl eintragen, zum Beispiel 49,90." });
        amountRef.current?.focus();
        return;
      }
    }
    const dl = deadlineSpecs(d.deadlines);
    if (dl.error) {
      setErrors({ form: dl.error });
      return;
    }
    for (const r of d.refs) {
      if (r.value.trim() && r.value.trim().length > 80) {
        setErrors({ form: "Eine Nummer ist zu lang. Bitte kürze sie auf höchstens 80 Zeichen." });
        return;
      }
    }

    setBusy(true);
    try {
      if (name && company.id === null && !createNew) {
        const sim = await api.get<{ items: Similar[] }>("/api/companies/similar", { name });
        if (sim.items.length) {
          setConflict({ name, similar: sim.items });
          return;
        }
      }
      const open = d.deadlines.filter((x) => !x.removed && !x.accepted).length;
      if (open > 0) {
        const ok = await confirm({
          title: "Frist ohne Erinnerung?",
          text:
            open === 1
              ? "Für eine Frist hast du „Frist stimmt“ nicht angehakt. Dafür gibt es keine Erinnerung. Trotzdem weiter?"
              : `Für ${open} Fristen hast du „Frist stimmt“ nicht angehakt. Dafür gibt es keine Erinnerung. Trotzdem weiter?`,
          confirmLabel: "Ja, ohne Erinnerung",
        });
        if (!ok) return;
      }

      const tagsChanged = [...d.tag_ids].sort().join() !== detail.tags.map((t) => t.id).sort().join();
      if (tagsChanged) await api.put(`/api/documents/${docId}/tags`, { tag_ids: d.tag_ids });
      if (d.paid !== detail.paid) await api.post(`/api/documents/${docId}/paid`, { paid: d.paid });

      const seen = new Set<string>();
      const references = d.refs
        .map((r) => ({ type: r.type, value: r.value.trim() }))
        .filter((r) => {
          const k = `${r.type}|${r.value.toLowerCase()}`;
          if (!r.value || seen.has(k)) return false;
          seen.add(k);
          return true;
        });

      await api.post(`/api/documents/${docId}/confirm`, {
        fields: {
          doc_type: d.doc_type.trim() || null,
          company_id: name ? company.id : null,
          category_id: d.category_id ? Number(d.category_id) : null,
          doc_date: d.doc_date || null,
          amount_cents: amount,
          note: d.note.trim() || null,
        },
        ...(name && company.id === null ? { company_name: name, create_company: true } : {}),
        references,
        deadlines: dl.specs,
      });
      drafts.delete(docId);
      toast(hasNext ? "Bestätigt. Weiter mit dem nächsten Dokument." : "Bestätigt.");
      onConfirmed();
    } catch (e) {
      if (e instanceof ApiError && e.code === "neue_firma") {
        const similar = Array.isArray(e.extra.similar) ? (e.extra.similar as Similar[]) : [];
        if (similar.length) setConflict({ name: String(e.extra.name ?? name), similar });
        else void submit({ company: { id: null, name }, createNew: true });
      } else {
        setErrors({ form: errorText(e) });
        toast(errorText(e), "bad");
      }
    } finally {
      setBusy(false);
    }
  };

  const onSame = async (s: Similar) => {
    if (!conflict) return;
    const alias = conflict.name;
    setConflict(null);
    try {
      await api.post(`/api/companies/${s.id}/aliases`, { alias });
      void companies.refetch();
      const company = { id: s.id, name: s.name };
      set({ company }, "company");
      void submit({ company });
    } catch (e) {
      toast(errorText(e), "bad");
    }
  };
  const onNew = () => {
    if (!conflict) return;
    const company = { id: null, name: conflict.name };
    setConflict(null);
    set({ newCompanyOk: true }, "company");
    void submit({ company, createNew: true });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const tagList = tags.data?.items ?? [];
  const catList = categories.data?.items ?? [];
  const typeListId = `types-${docId}`;
  const similarHint = !!companyName && d.company.id === null;

  return (
    <>
    <form className="rv-form" ref={formRef} onSubmit={onSubmit} onKeyDown={onKey} aria-label="Angaben zum Dokument" noValidate>
      <div className="rv-sect">
        <h2>Angaben prüfen</h2>
        <Field
          label="Firma"
          htmlFor="f-company"
          right={label(sCompany)}
          className={sCompany.cls}
          hint={similarHint ? "Diese Firma gibt es noch nicht. Sie wird beim Bestätigen neu angelegt." : undefined}
        >
          <CompanyCombobox
            id="f-company"
            companies={companies.data?.items ?? []}
            value={d.company}
            onChange={(company) => set({ company, newCompanyOk: false }, "company")}
          />
          {acceptBtn("company", sCompany)}
        </Field>

        <Field label="Art des Dokuments" htmlFor="f-type" right={label(sType)} className={sType.cls}>
          <input
            id="f-type"
            list={typeListId}
            value={d.doc_type}
            maxLength={60}
            onChange={(e) => set({ doc_type: e.target.value }, "doc_type")}
            placeholder="Zum Beispiel Rechnung"
          />
          <datalist id={typeListId}>
            {docTypes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          {acceptBtn("doc_type", sType)}
        </Field>

        <Field label="Bereich" htmlFor="f-cat" right={label(sCat)} className={sCat.cls}>
          <select id="f-cat" value={d.category_id} onChange={(e) => set({ category_id: e.target.value }, "category")}>
            <option value="">Kein Bereich</option>
            {catList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {acceptBtn("category", sCat)}
          <details className="rv-details">
            <summary>Neuen Bereich anlegen</summary>
            <div className="row">
              <input
                aria-label="Name des neuen Bereichs"
                value={newCat}
                maxLength={60}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (newCat.trim()) addCat.mutate(newCat.trim());
                  }
                }}
              />
              <button className="btn secondary" type="button" disabled={!newCat.trim() || addCat.isPending} onClick={() => addCat.mutate(newCat.trim())}>
                Anlegen
              </button>
            </div>
          </details>
        </Field>

        <div className="rv-two">
          <Field label="Datum" htmlFor="f-date" right={label(sDate)} className={sDate.cls}>
            <input id="f-date" type="date" value={d.doc_date} onChange={(e) => set({ doc_date: e.target.value }, "doc_date")} />
            {acceptBtn("doc_date", sDate)}
          </Field>
          <Field
            label="Betrag in Euro"
            htmlFor="f-amount"
            right={label(sAmount)}
            className={sAmount.cls}
            hint={errors.amount ? <span className="err">{errors.amount}</span> : undefined}
          >
            <input
              id="f-amount"
              ref={amountRef}
              inputMode="decimal"
              value={d.amount}
              placeholder="0,00"
              aria-invalid={!!errors.amount}
              className={errors.amount ? "invalid" : ""}
              onChange={(e) => set({ amount: e.target.value }, "amount")}
            />
            {acceptBtn("amount", sAmount)}
          </Field>
        </div>

        <label className="rv-check">
          <input type="checkbox" checked={d.paid} onChange={(e) => set({ paid: e.target.checked })} />
          <span>Schon bezahlt</span>
        </label>

        <Field label="Notiz" htmlFor="f-note" hint="Strg+Enter bestätigt das Dokument.">
          <textarea id="f-note" rows={2} value={d.note} maxLength={4000} onChange={(e) => set({ note: e.target.value })} />
        </Field>
      </div>

      <div className="rv-sect">
        <h2>Tags</h2>
        <div className="rv-tags" role="group" aria-label="Tags">
          {tagList.map((t) => {
            const on = d.tag_ids.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                className="chip"
                aria-pressed={on}
                onClick={() => set({ tag_ids: on ? d.tag_ids.filter((x) => x !== t.id) : [...d.tag_ids, t.id] })}
              >
                <span className="rv-dot" style={{ background: t.color }} aria-hidden="true" />
                {on ? "✓ " : ""}
                {t.name}
              </button>
            );
          })}
          {tagList.length === 0 ? <span className="muted">Noch keine Tags angelegt.</span> : null}
        </div>
        <div className="row">
          <input
            aria-label="Name des neuen Tags"
            placeholder="Neuer Tag"
            value={newTag}
            maxLength={40}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                if (newTag.trim()) addTag.mutate(newTag.trim());
              }
            }}
          />
          <button className="btn secondary" type="button" disabled={!newTag.trim() || addTag.isPending} onClick={() => addTag.mutate(newTag.trim())}>
            Tag anlegen
          </button>
        </div>
      </div>

      <div className="rv-sect">
        <div className="row spread wrap">
          <h2>Nummern</h2>
          <button
            className="btn secondary small"
            type="button"
            onClick={() => set({ refs: [...d.refs, { key: `r${++refSeq}`, type: refTypes[0] ?? "aktenzeichen", value: "" }] })}
          >
            Nummer hinzufügen
          </button>
        </div>
        {d.refs.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Keine Kunden-, Vertrags- oder Aktenzeichen erkannt. Mit solchen Nummern findet die App zusammengehörige Dokumente.
          </p>
        ) : null}
        {d.refs.map((r, i) => (
          <div className="rv-ref" key={r.key}>
            <div className="field">
              <label htmlFor={`ref-t-${r.key}`}>Art der Nummer</label>
              <select
                id={`ref-t-${r.key}`}
                value={r.type}
                onChange={(e) => set({ refs: d.refs.map((x) => (x.key === r.key ? { ...x, type: e.target.value } : x)) })}
              >
                {(refTypes.includes(r.type) ? refTypes : [r.type, ...refTypes]).map((t) => (
                  <option key={t} value={t}>
                    {REF_LABEL[t] ?? t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`ref-v-${r.key}`}>Nummer</label>
              <input
                id={`ref-v-${r.key}`}
                className="mono"
                value={r.value}
                maxLength={80}
                onChange={(e) => set({ refs: d.refs.map((x) => (x.key === r.key ? { ...x, value: e.target.value } : x)) })}
              />
            </div>
            <button
              className="btn ghost"
              type="button"
              aria-label={`Nummer ${i + 1} entfernen`}
              onClick={() => set({ refs: d.refs.filter((x) => x.key !== r.key) })}
            >
              Entfernen
            </button>
          </div>
        ))}
      </div>

      <DeadlineEditor
        drafts={d.deadlines}
        onChange={(deadlines) => set({ deadlines })}
        types={deadlineTypes}
        defaults={defaults.data ?? {}}
        threshold={threshold}
        idPrefix={`dl-${docId}`}
      />

      <LinkSuggestions links={detail.links} docId={docId} onOpen={onOpenDoc} />

      <OcrText docId={docId} />

      <div className="rv-actions">
        {errors.form ? (
          <div className="notice bad" role="alert" style={{ margin: 0 }}>
            {errors.form}
          </div>
        ) : null}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Wird gespeichert …" : hasNext ? "Bestätigen und weiter" : "Bestätigen"}
        </button>
        <div className="row wrap">
          <button className="btn secondary" type="button" onClick={() => void askReprocess()} disabled={reprocess.isPending}>
            Neu erkennen
          </button>
          <button className="btn ghost" type="button" onClick={() => setArchiving(true)}>
            Archivieren
          </button>
        </div>
      </div>
    </form>
    {conflict ? <ConflictDialog name={conflict.name} similar={conflict.similar} onSame={(s) => void onSame(s)} onNew={onNew} onClose={() => setConflict(null)} /> : null}
    {archiving ? <ArchiveDialog onClose={() => setArchiving(false)} onArchive={(r) => archive.mutate(r)} busy={archive.isPending} /> : null}
    </>
  );
}
