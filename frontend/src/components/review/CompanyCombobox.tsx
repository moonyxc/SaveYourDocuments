import { useId, useMemo, useState } from "react";
import type { Company } from "./types";

const norm = (s: string) => s.trim().toLocaleLowerCase("de-DE").replace(/\s+/g, " ");

export type CompanyValue = { id: number | null; name: string };

/** Auswahlfeld mit Tippen: vorhandene Firmen vorschlagen oder eine neue Schreibweise eintragen. */
export function CompanyCombobox({
  id,
  companies,
  value,
  onChange,
  describedBy,
}: {
  id: string;
  companies: Company[];
  value: CompanyValue;
  onChange: (v: CompanyValue) => void;
  describedBy?: string;
}) {
  const list = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const q = norm(value.name);
  const matches = useMemo(() => {
    const hits = companies.filter((c) => !q || norm(c.name).includes(q) || c.aliases.some((a) => norm(a).includes(q)));
    return hits.slice(0, 40);
  }, [companies, q]);
  const exact = q ? companies.find((c) => norm(c.name) === q || c.aliases.some((a) => norm(a) === q)) : undefined;
  const showNew = !!q && !exact;
  const total = matches.length + (showNew ? 1 : 0);

  const pick = (c: Company) => {
    onChange({ id: c.id, name: c.name });
    setOpen(false);
    setActive(-1);
  };

  return (
    <div
      className="rv-combo"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <input
        id={id}
        className="rv-combo-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={list}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${list}-${active}` : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        value={value.name}
        placeholder="Firma eintragen oder auswählen"
        onClick={() => setOpen(true)}
        onChange={(e) => {
          const name = e.target.value;
          const hit = companies.find((c) => norm(c.name) === norm(name));
          onChange({ id: hit ? hit.id : null, name });
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(total - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(-1, a - 1));
          } else if (e.key === "Enter" && open && active >= 0) {
            e.preventDefault();
            if (active < matches.length) pick(matches[active]);
            else setOpen(false);
          } else if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && total > 0 ? (
        <ul id={list} role="listbox" aria-label="Firmen">
          {matches.map((c, i) => (
            <li
              key={c.id}
              id={`${list}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
            >
              <span>{c.name}</span>
              <span className="muted">{c.documents === 1 ? "1 Dokument" : `${c.documents} Dokumente`}</span>
            </li>
          ))}
          {showNew ? (
            <li
              id={`${list}-${matches.length}`}
              role="option"
              aria-selected={active === matches.length}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen(false)}
            >
              <span>
                Neue Firma „{value.name.trim()}“ anlegen
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
