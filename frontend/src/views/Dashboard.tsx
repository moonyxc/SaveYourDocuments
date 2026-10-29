import { useQuery } from "@tanstack/react-query";
import { api, type Json } from "../lib/api";
import { date, eur } from "../lib/format";
import { useNav } from "../lib/nav";
import { Badge, ErrorBox, PageHead, Spinner } from "../components/ui";
import { Onboarding } from "../components/dashboard/Onboarding";
import { Reminders } from "../components/dashboard/Reminders";
import "../components/dashboard/dashboard.css";

const WARNINGS: Record<string, { severe: boolean; tab: string; action: string }> = {
  integritaet: { severe: true, tab: "archiv", action: "Zu den Einstellungen" },
  sicherung: { severe: true, tab: "sicherung", action: "Sicherung ansehen" },
  keine_sicherung: { severe: false, tab: "sicherung", action: "Sicherung einrichten" },
  speicher: { severe: false, tab: "sicherung", action: "Speicher ansehen" },
  localsend_port: { severe: false, tab: "empfang", action: "Empfang einstellen" },
};

const INVOICE_TYPES = ["Rechnung", "Beitragsrechnung", "Mahnung"];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Guten Abend";
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function Dashboard() {
  const { go } = useNav();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Json>("/api/dashboard") });
  const incoming = useQuery({ queryKey: ["incoming"], queryFn: () => api.get<Json>("/api/incoming") });

  if (dash.isLoading) return <Spinner />;
  if (dash.isError || !dash.data) return <ErrorBox error={dash.error} retry={() => void dash.refetch()} />;

  const d = dash.data;
  const requests: Json[] = d.incoming ?? incoming.data?.items ?? [];
  const waiting: number = (d.waiting_files ?? 0) + requests.length;
  const toReview: number = d.to_review ?? 0;
  const upcoming: Json[] = (d.upcoming ?? []).filter((x: Json) => x.status === "offen");
  const overdue = upcoming.filter((x) => x.overdue).length;
  const reminders: Json[] = d.reminders ?? [];
  const recent: Json[] = d.recent ?? [];
  const warnings: Json[] = d.warnings ?? [];
  const jobs: Json = d.jobs ?? {};
  const working: number = Math.max((jobs.wartend ?? 0) + (jobs.laeuft ?? 0), d.processing ?? 0);
  const failed: number = jobs.fehler ?? 0;
  const total: number = d.documents_total ?? 0;
  const fresh = total === 0 && waiting === 0 && toReview === 0 && working === 0;
  const idle = waiting === 0 && toReview === 0 && upcoming.length === 0 && reminders.length === 0;

  return (
    <div className="stack">
      <PageHead
        title={greeting()}
        lead={
          fresh
            ? "Willkommen bei Save Your Documents. Hier landen bald deine wichtigen Dokumente, sicher auf diesem Computer."
            : `${idle ? "Alles erledigt. Heute gibt es nichts zu tun." : "Das ist heute zu tun."} Im Archiv: ${count(total, "Dokument", "Dokumente")}.`
        }
      />

      {warnings.map((w) => {
        const meta = WARNINGS[w.code] ?? { severe: false, tab: "", action: "Zu den Einstellungen" };
        return (
          <div key={`${w.code}-${w.message}`} className={`notice ${meta.severe ? "bad" : ""}`} role={meta.severe ? "alert" : "status"}>
            <div className="warn-item">
              <div>
                <strong>{meta.severe ? "▲ Wichtig: " : "● Hinweis: "}</strong>
                {w.message}
              </div>
              <button className="btn secondary small" onClick={() => go("settings", meta.tab ? { tab: meta.tab } : {})}>
                {meta.action}
              </button>
            </div>
          </div>
        );
      })}

      {working > 0 ? (
        <div className="notice good" role="status">
          <div className="row">
            <span className="spinner" aria-hidden="true" />
            <span>
              {working === 1 ? "1 Dokument wird gerade erkannt." : `${working} Dokumente werden gerade erkannt.`} Das dauert einen Moment. Die
              Ergebnisse erscheinen unter „Prüfen“.
            </span>
          </div>
        </div>
      ) : null}
      {failed > 0 ? (
        <div className="notice" role="status">
          <div className="warn-item">
            <div>
              <strong>● Hinweis: </strong>
              Bei {failed === 1 ? "1 Dokument" : `${failed} Dokumenten`} hat die Erkennung nicht geklappt. Öffne das Dokument und trage die
              Angaben von Hand ein oder starte die Erkennung neu.
            </div>
            <button className="btn secondary small" onClick={() => go("docs")}>
              Zu den Dokumenten
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid-gap g3">
        <section className="card action-card" aria-labelledby="c-new">
          <div className="label" id="c-new">
            Neu eingegangen
          </div>
          <div className="metric">{waiting}</div>
          <p className="muted">
            {waiting === 0
              ? "Es wartet nichts Neues auf dich."
              : [
                  d.waiting_files ? `${count(d.waiting_files, "Foto wartet", "Fotos warten")} auf dich.` : "",
                  requests.length ? `${count(requests.length, "Anfrage vom Handy wartet", "Anfragen vom Handy warten")} auf deine Antwort.` : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
          </p>
          <button className={`btn ${waiting ? "primary" : "secondary"}`} onClick={() => go("import")}>
            Fotos sortieren
          </button>
        </section>
        <section className="card action-card" aria-labelledby="c-review">
          <div className="label" id="c-review">
            Zu prüfen
          </div>
          <div className="metric">{toReview}</div>
          <p className="muted">
            {toReview === 0 ? "Alle erkannten Dokumente sind geprüft." : "Erkannte Dokumente, die du bestätigen musst."}
          </p>
          <button className={`btn ${toReview ? "primary" : "secondary"}`} onClick={() => go("review")}>
            Jetzt prüfen
          </button>
        </section>
        <section className="card action-card" aria-labelledby="c-due">
          <div className="label" id="c-due">
            Bald fällig
          </div>
          <div className="metric">{upcoming.length}</div>
          <p className="muted">
            {upcoming.length === 0
              ? "In den nächsten 30 Tagen ist nichts fällig."
              : overdue
                ? `${overdue} davon ${overdue === 1 ? "ist" : "sind"} schon überfällig. Rechnungen und Kündigungsfristen der nächsten 30 Tage.`
                : "Rechnungen und Kündigungsfristen in den nächsten 30 Tagen."}
          </p>
          <button className={`btn ${overdue ? "primary" : "secondary"}`} onClick={() => go("fristen")}>
            Fristen ansehen
          </button>
        </section>
      </div>

      {reminders.length ? <Reminders items={reminders} /> : null}

      {fresh ? <Onboarding status={incoming.data?.status} /> : null}

      {!fresh ? (
        <section className="card" aria-labelledby="recent-title">
          <div className="row spread wrap">
            <h2 id="recent-title">Zuletzt geprüft</h2>
            <button className="btn ghost small" onClick={() => go("docs")}>
              Alle Dokumente
            </button>
          </div>
          {recent.length ? (
            <ul className="list">
              {recent.map((r) => (
                <li key={r.id} className="item">
                  <div className="grow">
                    <strong>{r.company_name || r.display_name}</strong>
                    {r.doc_type ? ` · ${r.doc_type}` : ""}
                    <div className="muted">
                      {[r.category_name, date(r.doc_date)].filter((x) => x && x !== "–").join(" · ")}
                    </div>
                  </div>
                  {r.amount_cents != null ? (
                    <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                      {eur(r.amount_cents)}
                    </span>
                  ) : null}
                  {r.paid ? (
                    <Badge tone="green">✓ Bezahlt</Badge>
                  ) : r.amount_cents != null && INVOICE_TYPES.includes(r.doc_type) ? (
                    <Badge tone="red">● Offen</Badge>
                  ) : null}
                  <button className="btn secondary small" aria-label={`Öffnen: ${r.company_name || r.display_name}`} onClick={() => go("docs", { doc: r.id })}>
                    Öffnen
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Noch kein Dokument geprüft. Sobald du eines bestätigst, erscheint es hier.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
