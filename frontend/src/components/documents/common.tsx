import { useQuery } from "@tanstack/react-query";
import { api, type Json } from "../../lib/api";
import { date, relativeDays } from "../../lib/format";
import { Badge } from "../ui";
import "./documents.css";

export type Tag = { id: number; name: string; color: string; documents?: number };
export type Company = { id: number; name: string; documents: number; aliases: string[] };
export type Category = { id: number; name: string; parent_id: number | null; documents: number };

export const REF_LABEL: Record<string, string> = {
  aktenzeichen: "Aktenzeichen",
  kundennummer: "Kundennummer",
  vertragsnummer: "Vertragsnummer",
  schadennummer: "Schadennummer",
  rechnungsnummer: "Rechnungsnummer",
  geschaeftszeichen: "Geschäftszeichen",
};

export const DEADLINE_LABEL: Record<string, string> = {
  zahlungsziel: "Zahlung fällig",
  vertragsende: "Vertragsende",
  kuendigungsfrist: "Kündigung bis",
  sonstige: "Sonstige Frist",
};

export const FIELD_LABEL: Record<string, string> = {
  doc_type: "Art",
  company_id: "Firma",
  category_id: "Bereich",
  doc_date: "Datum",
  amount_cents: "Betrag",
  note: "Notiz",
  firma: "Firma",
  datum: "Datum",
  betrag: "Betrag",
  art: "Art",
  bereich: "Bereich",
};

/** Arten, bei denen "offen" sinnvoll ist (es wird etwas bezahlt). */
const PAYABLE = new Set(["Rechnung", "Beitragsrechnung", "Mahnung", "Jahresabrechnung", "Kaufbeleg"]);

export const STATE_LABEL: Record<string, string> = {
  eingegangen: "Wird erkannt",
  verarbeitet: "Wird erkannt",
  erkannt: "Zu prüfen",
  geprueft: "Geprüft",
};

export const useMeta = () =>
  useQuery({ queryKey: ["meta"], queryFn: () => api.get<Json>("/api/meta"), staleTime: 60_000 });
export const useCompanies = () =>
  useQuery({
    queryKey: ["companies", "items"],
    queryFn: async () => (await api.get<{ items: Company[] }>("/api/companies")).items,
  });
export const useCategories = () =>
  useQuery({
    queryKey: ["categories", "items"],
    queryFn: async () => (await api.get<{ items: Category[] }>("/api/categories")).items,
  });
export const useTags = () =>
  useQuery({
    queryKey: ["tags", "items"],
    queryFn: async () => (await api.get<{ items: Tag[] }>("/api/tags")).items,
  });
export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => api.get<Json>("/api/settings") });

/** Offene, bestaetigte Fristen je Dokument (frueheste zuerst). */
export function useOpenDeadlines() {
  return useQuery({
    queryKey: ["deadlines", "open-by-doc"],
    queryFn: async () => {
      const res = await api.get<{ items: Json[] }>("/api/deadlines", { status: "offen" });
      const map = new Map<number, Json>();
      for (const d of res.items) if (!map.has(d.document_id)) map.set(d.document_id, d);
      return map;
    },
  });
}

export function TagBadge({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  return (
    <span className="dx-tag">
      <i style={{ background: tag.color }} aria-hidden="true" />
      {tag.name}
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={`Tag „${tag.name}“ entfernen`}>
          ×
        </button>
      ) : null}
    </span>
  );
}

export function PaidBadge({ doc }: { doc: Json }) {
  if (doc.paid) return <Badge tone="green">✓ Bezahlt</Badge>;
  if (doc.amount_cents !== null && PAYABLE.has(doc.doc_type)) return <Badge tone="yellow">○ Offen</Badge>;
  return null;
}

export function DeadlineBadge({ deadline }: { deadline?: Json }) {
  if (!deadline) return null;
  const late = deadline.overdue;
  return (
    <Badge tone={late ? "red" : deadline.days_left <= 7 ? "yellow" : "gray"} title={`${DEADLINE_LABEL[deadline.type] ?? "Frist"}: ${date(deadline.due_date)}`}>
      {late ? "⚠ Überfällig" : "⏱ Frist"} {date(deadline.due_date).slice(0, 6)} · {relativeDays(deadline.due_date)}
    </Badge>
  );
}

export function StateBadge({ doc }: { doc: Json }) {
  if (doc.state === "geprueft") return null;
  return <Badge tone={doc.state === "erkannt" ? "purple" : "gray"}>{doc.state === "erkannt" ? "● Zu prüfen" : "… Wird erkannt"}</Badge>;
}

export function StatusBadges({ doc, deadline }: { doc: Json; deadline?: Json }) {
  return (
    <div className="dx-tags">
      <PaidBadge doc={doc} />
      <StateBadge doc={doc} />
      {doc.archived ? <Badge tone="gray">▣ Archiviert</Badge> : null}
      <DeadlineBadge deadline={deadline} />
    </div>
  );
}

export function mimeKind(mime: string): "image" | "pdf" | "other" {
  if (["image/jpeg", "image/png", "image/webp"].includes(mime)) return "image";
  if (mime === "application/pdf") return "pdf";
  return "other";
}
