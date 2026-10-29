import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, mediaUrl, type Json } from "../lib/api";
import { eur, pct } from "../lib/format";
import { useNav } from "../lib/nav";
import { Empty, ErrorBox, PageHead, Spinner } from "../components/ui";
import { BarList, MonthColumns, MonthTable, YearColumns, isUnassigned, monthPoints, type Row } from "../components/stats/charts";
import "../components/stats/stats.css";

type Stats = { rows: Row[]; by_month: Row[]; total_cents: number; count: number; excluded_types: string[] };
type Group = "firma" | "bereich" | "art";

const GROUPS: { id: Group; label: string; head: string }[] = [
  { id: "firma", label: "Nach Firma", head: "Firma" },
  { id: "bereich", label: "Nach Bereich", head: "Bereich" },
  { id: "art", label: "Nach Dokumentart", head: "Dokumentart" },
];

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function Stats() {
  const { go } = useNav();
  const thisYear = String(new Date().getFullYear());
  const [yearPick, setYearPick] = useState<string | null>(null);
  const [withAll, setWithAll] = useState(false);
  const [company, setCompany] = useState("");
  const [category, setCategory] = useState("");
  const [paid, setPaid] = useState("");
  const [group, setGroup] = useState<Group>("firma");

  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api.get<Json>("/api/meta"), staleTime: 60_000 });
  const companies = useQuery({ queryKey: ["companies"], queryFn: () => api.get<{ items: Json[] }>("/api/companies") });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api.get<{ items: Json[] }>("/api/categories") });

  const ready = !withAll || Boolean(meta.data);
  const base = {
    doc_types: withAll ? (meta.data?.doc_types ?? []).join("|") : undefined,
    company_id: company || undefined,
    category_id: category || undefined,
    paid: paid === "ja" ? true : paid === "nein" ? false : undefined,
  };
  const filtersActive = withAll || Boolean(company || category || paid);

  const fetchStats = (key: string, params: Json, enabled = true) =>
    useQuery({
      queryKey: ["stats", key, params],
      queryFn: () => api.get<Stats>("/api/stats", params),
      enabled: ready && enabled,
      placeholderData: keepPreviousData,
    });

  const years = fetchStats("jahr", { ...base, group_by: "jahr" });
  const yearList = (years.data?.rows ?? []).map((r) => r.label).filter((l) => /^\d{4}$/.test(l)).sort().reverse();
  const year = yearPick ?? (yearList.includes(thisYear) || !yearList.length ? thisYear : yearList[0]);
  const range = year === "alle" ? {} : { date_from: `${year}-01-01`, date_to: `${year}-12-31` };
  const scoped = { ...base, ...range };

  const byFirma = fetchStats("firma", { ...scoped, group_by: "firma" });
  const byBereich = fetchStats("bereich", { ...scoped, group_by: "bereich" });
  const detail = fetchStats(group, { ...scoped, group_by: group }, group === "art");
  const open = fetchStats("offen", { ...scoped, group_by: "firma", doc_types: base.doc_types, company_id: base.company_id, category_id: base.category_id, paid: false }, paid === "");

  const detailData = group === "firma" ? byFirma.data : group === "bereich" ? byBereich.data : detail.data;
  const main = byFirma.data;
  const noArchiveData = years.data && !yearList.length && !years.data.rows.length && !filtersActive;

  const months = monthPoints(main?.by_month ?? [], year);
  const monthsWithData = (main?.by_month ?? []).filter((m) => /^\d{4}-\d{2}$/.test(m.label));
  let span = 0;
  if (year !== "alle") span = year === thisYear ? new Date().getMonth() + 1 : 12;
  else if (monthsWithData.length) {
    const first = monthsWithData[0].label;
    const last = monthsWithData[monthsWithData.length - 1].label;
    span = (Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + Number(last.slice(5)) - Number(first.slice(5)) + 1;
  }
  const avg = main && span && main.count ? Math.round(main.total_cents / span) : null;
  const top = main?.rows[0];

  const csvHref = mediaUrl("/api/stats.csv", { ...scoped, group_by: group });
  const pick = (label: string) => go("docs", { q: label });
  const loadingFirst = years.isLoading || (ready && byFirma.isLoading);
  const failed = years.error ?? byFirma.error ?? byBereich.error;
  const excluded = main?.excluded_types ?? [];

  return (
    <div className="stack">
      <PageHead
        title="Auswertung"
        lead="Nur geprüfte Dokumente werden gezählt. Alle Beträge sind in Euro. Dokumente ohne Betrag fehlen in den Summen."
      />

      {failed ? <ErrorBox error={failed} retry={() => void years.refetch()} /> : null}
      {loadingFirst ? <Spinner /> : null}

      {noArchiveData ? (
        <div className="card">
          <Empty
            title="Noch nichts auszuwerten"
            action={
              <button className="btn primary" onClick={() => go("review")}>
                Dokumente prüfen
              </button>
            }
          >
            Sobald du Dokumente mit einem Betrag geprüft hast, siehst du hier Summen pro Firma, Bereich und Jahr.
          </Empty>
        </div>
      ) : years.data ? (
        <>
          <section className="card" aria-label="Filter">
            <div className="stat-filters">
              <div className="field">
                <label htmlFor="s-year">Jahr</label>
                <select id="s-year" value={year} onChange={(e) => setYearPick(e.target.value)}>
                  <option value="alle">Alle Jahre</option>
                  {[...new Set([...yearList, year].filter((y) => y !== "alle"))].sort().reverse().map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="s-company">Firma</label>
                <select id="s-company" value={company} onChange={(e) => setCompany(e.target.value)}>
                  <option value="">Alle Firmen</option>
                  {(companies.data?.items ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="s-cat">Bereich</label>
                <select id="s-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Alle Bereiche</option>
                  {(categories.data?.items ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="s-paid">Zahlung</label>
                <select id="s-paid" value={paid} onChange={(e) => setPaid(e.target.value)}>
                  <option value="">Bezahlt und offen</option>
                  <option value="ja">Nur bezahlte</option>
                  <option value="nein">Nur offene</option>
                </select>
              </div>
            </div>
            <label className="check" style={{ marginTop: ".75rem" }}>
              <input type="checkbox" checked={withAll} onChange={(e) => setWithAll(e.target.checked)} />
              Mahnungen und Zahlungsbelege mitzählen
            </label>
            <p className="hint" style={{ marginTop: 0 }}>
              {withAll
                ? "Alle Dokumentarten werden gezählt. Dieselbe Ausgabe kann dadurch doppelt erscheinen, zum Beispiel als Rechnung und als Zahlungsbeleg."
                : `Nicht mitgezählt: ${excluded.length ? excluded.join(" und ") : "Mahnung und Zahlungsbeleg"}. Sie wiederholen meist einen Betrag, der schon in der Rechnung steht.`}
            </p>
            {filtersActive || yearPick !== null ? (
              <button
                className="btn ghost small"
                onClick={() => {
                  setYearPick(null);
                  setWithAll(false);
                  setCompany("");
                  setCategory("");
                  setPaid("");
                }}
              >
                Filter zurücksetzen
              </button>
            ) : null}
          </section>

          {main && main.count === 0 ? (
            <div className="card">
              <Empty title={year === "alle" ? "Keine Dokumente für diese Auswahl" : `Keine Dokumente für ${year}`}>
                {year !== "alle" && yearList.length
                  ? "Wähle ein anderes Jahr oder „Alle Jahre“. Oder nimm einen Filter heraus."
                  : "Nimm einen Filter heraus oder prüfe weitere Dokumente mit Betrag."}
              </Empty>
            </div>
          ) : main ? (
            <>
              <div className="kpis">
                <section className="card" aria-label="Summe">
                  <div className="label">{year === "alle" ? "Summe, alle Jahre" : `Summe ${year}`}</div>
                  <div className="metric">{eur(main.total_cents)}</div>
                  {open.data ? (
                    <p className="sub muted">
                      {open.data.count ? `Noch offen: ${eur(open.data.total_cents)} (${count(open.data.count, "Dokument", "Dokumente")})` : "✓ Alles bezahlt"}
                    </p>
                  ) : null}
                </section>
                <section className="card" aria-label="Dokumente">
                  <div className="label">Dokumente</div>
                  <div className="metric">{main.count}</div>
                  <p className="sub muted">mit Betrag, geprüft</p>
                </section>
                <section className="card" aria-label="Durchschnitt pro Monat">
                  <div className="label">Ø pro Monat</div>
                  <div className="metric">{eur(avg)}</div>
                  <p className="sub muted">{span ? `Durchschnitt über ${count(span, "Monat", "Monate")}` : "Zu wenige Datumsangaben"}</p>
                </section>
                <section className="card" aria-label="Größte Firma">
                  <div className="label">Größte Firma</div>
                  <div className="metric">{eur(top?.sum_cents)}</div>
                  <p className="sub muted">
                    {top ? `${top.label} · ${pct(top.share)} der Summe` : "–"}
                  </p>
                </section>
              </div>

              <div className="grid-gap g2">
                <section className="card" aria-labelledby="h-firma">
                  <h2 id="h-firma">Ausgaben pro Firma</h2>
                  <BarList rows={main.rows} name="Ausgaben pro Firma" onPick={pick} />
                </section>
                <section className="card" aria-labelledby="h-bereich">
                  <h2 id="h-bereich">Ausgaben pro Bereich</h2>
                  {byBereich.data ? <BarList rows={byBereich.data.rows} name="Ausgaben pro Bereich" onPick={pick} /> : <Spinner />}
                </section>
              </div>

              <section className="card" aria-labelledby="h-month">
                <h2 id="h-month">{year === "alle" ? "Ausgaben pro Monat (letzte Monate mit Daten)" : `Ausgaben pro Monat in ${year}`}</h2>
                {months.length ? (
                  <>
                    <MonthColumns points={months} name="Ausgaben pro Monat" />
                    <MonthTable points={months} />
                  </>
                ) : (
                  <p className="muted">Die geprüften Dokumente haben kein Datum. Darum gibt es keine Monatsansicht.</p>
                )}
              </section>

              <section className="card" aria-labelledby="h-year">
                <h2 id="h-year">Ausgaben pro Jahr</h2>
                <YearColumns rows={years.data.rows} selected={year} name="Ausgaben pro Jahr" />
              </section>

              <section className="card flush" aria-labelledby="h-detail">
                <div className="row spread wrap" style={{ padding: "1.25rem 1.25rem 0" }}>
                  <h2 id="h-detail" style={{ margin: 0 }}>
                    Alle Zahlen
                  </h2>
                  <a className="btn secondary small" href={csvHref} download>
                    Als CSV speichern
                  </a>
                </div>
                <div className="chips" role="group" aria-label="Gruppieren" style={{ padding: "1rem 1.25rem 0", margin: 0 }}>
                  {GROUPS.map((g) => (
                    <button key={g.id} className="chip" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
                      {g.label}
                    </button>
                  ))}
                </div>
                <div style={{ overflowX: "auto", marginTop: ".5rem" }}>
                  <table className="tbl">
                    <caption className="sr">Summen {GROUPS.find((g) => g.id === group)?.label.toLowerCase()}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{GROUPS.find((g) => g.id === group)?.head}</th>
                        <th scope="col" className="num">
                          Dokumente
                        </th>
                        <th scope="col" className="num">
                          Anteil
                        </th>
                        <th scope="col" className="num">
                          Summe
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detailData?.rows ?? []).map((r) => (
                        <tr key={r.label}>
                          <td>
                            {isUnassigned(r.label) ? (
                              r.label
                            ) : (
                              <button className="linkbtn" onClick={() => pick(r.label)} aria-label={`${r.label}: Dokumente anzeigen`}>
                                {r.label}
                              </button>
                            )}
                          </td>
                          <td className="num">{r.count}</td>
                          <td className="num">{pct(r.share)}</td>
                          <td className="num">{eur(r.sum_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {detailData ? (
                      <tfoot>
                        <tr>
                          <td>Gesamt</td>
                          <td className="num">{detailData.count}</td>
                          <td className="num" />
                          <td className="num">{eur(detailData.total_cents)}</td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
