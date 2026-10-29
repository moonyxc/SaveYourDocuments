export type Extraction = { field: string; value: string | null; confidence: number; source: string };
export type Part = { page: number; name: string | null; mime: string; size: number; sha256: string };
export type Reference = { id?: number; type: string; value: string; source?: string; confirmed?: boolean | number };
export type Tag = { id: number; name: string; color: string };
export type Company = { id: number; name: string; documents: number; aliases: string[] };
export type Category = { id: number; name: string; parent_id: number | null };

export type Deadline = {
  id: number;
  type: string;
  due_date: string;
  confirmed: boolean;
  status: string;
  repeat_months: number;
  lead_days: number[];
  note: string | null;
  source: string;
  confidence: number | null;
};

export type DocLink = {
  id: number;
  type: string;
  status: "vorgeschlagen" | "bestaetigt";
  reason: string | null;
  score: number;
  direction: "ausgehend" | "eingehend";
  other: { id: number; doc_type: string | null; doc_date: string | null; company_name: string | null; original_name: string };
};

export type DocDetail = {
  id: number;
  original_name: string;
  display_name: string;
  mime: string;
  pages: number;
  state: string;
  archived: boolean;
  doc_type: string | null;
  company_id: number | null;
  company_name: string | null;
  category_id: number | null;
  doc_date: string | null;
  amount_cents: number | null;
  paid: boolean;
  note: string | null;
  tags: Tag[];
  parts: Part[];
  references: Reference[];
  extractions: Extraction[];
  deadlines: Deadline[];
  links: DocLink[];
  job: { state: string; error_code: string | null } | null;
};

export type QueueItem = {
  id: number;
  doc_type: string | null;
  company_name: string | null;
  doc_date: string | null;
  amount_cents: number | null;
  original_name: string;
};

export const FIELD_KEYS = ["company", "doc_type", "category", "doc_date", "amount"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

/** Zuordnung unserer Felder zu den Namen der Erkennung. */
export const EXTRACTION_NAME: Record<FieldKey, string> = {
  company: "firma",
  doc_type: "art",
  category: "bereich",
  doc_date: "datum",
  amount: "betrag",
};

export const DEADLINE_LABEL: Record<string, string> = {
  zahlungsziel: "Zahlungsziel",
  vertragsende: "Vertragsende",
  kuendigungsfrist: "Kündigungsfrist",
  sonstige: "Sonstige Frist",
};

export const REF_LABEL: Record<string, string> = {
  aktenzeichen: "Aktenzeichen",
  kundennummer: "Kundennummer",
  vertragsnummer: "Vertragsnummer",
  schadennummer: "Schadennummer",
  rechnungsnummer: "Rechnungsnummer",
  geschaeftszeichen: "Geschäftszeichen",
};

export const LINK_LABEL: Record<string, string> = {
  antwort_auf: "ist eine Antwort auf",
  gehoert_zu: "gehört zu",
  ersetzt: "ersetzt",
};

export const LINK_CHOICE: Record<string, string> = {
  antwort_auf: "Ist eine Antwort",
  gehoert_zu: "Gehört dazu",
  ersetzt: "Ersetzt das andere",
};

export const JOB_ERRORS: Record<string, string> = {
  ocr_nicht_verfuegbar:
    "Die Texterkennung steht auf diesem Computer nicht zur Verfügung. Du kannst die Angaben von Hand eintragen. Hinweise zur Einrichtung findest du in den Einstellungen unter System.",
  datei_unlesbar:
    "Die Datei konnte nicht gelesen werden. Sieh dir das Original an. Ist es beschädigt, fotografiere oder scanne es neu.",
  interner_fehler: "Beim Erkennen ist ein Fehler aufgetreten. Versuche es noch einmal oder trage die Angaben von Hand ein.",
};

export const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);
