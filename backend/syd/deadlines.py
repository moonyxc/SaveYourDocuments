"""Fristen und Erinnerungen (PLAN 4.3).

Regeln:
- Nur bestaetigte Fristen (`confirmed = 1`) an geprueften, nicht archivierten Dokumenten zaehlen.
- Pro Frist wird nur die naechstliegende faellige Erinnerung gezeigt; aeltere werden als erledigt
  markiert (Nachholen nach laengerem Ausschalten ohne Erinnerungsflut).
- Wiederholfristen erzeugen nach Ablauf die naechste Frist, ausser ein bestaetigt verknuepftes
  Kuendigungsdokument stoppt die Wiederholung.
- Ist ein Dokument bezahlt, sind seine Zahlungsfristen und -erinnerungen erledigt.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from typing import TYPE_CHECKING

from .util import add_months, now_iso, valid_iso_date

if TYPE_CHECKING:
    from .repo import Repo

CANCEL_TYPES = ("Kündigung", "Kündigungsbestätigung")


def _bad(msg: str, code: str = "ungueltig", status: int = 400):
    from .repo import ArchiveError

    return ArchiveError(msg, code, status)


class Deadlines:
    def __init__(self, repo: Repo):
        self.repo = repo
        self.v = repo.v

    # ------------------------------------------------------------------ Hilfen

    def default_leads(self, dtype: str) -> list[int]:
        raw = self.v.scalar(
            "SELECT lead_days FROM reminder_default WHERE deadline_type = ?", (dtype,)
        )
        return json.loads(raw) if raw else [7, 1]

    def set_default_leads(self, dtype: str, leads: list[int]) -> None:
        from .repo import DEADLINE_TYPES

        if dtype not in DEADLINE_TYPES:
            raise _bad("Unbekannte Fristart.")
        leads = self._clean_leads(leads)
        self.v.execute(
            "INSERT INTO reminder_default (deadline_type, lead_days) VALUES (?,?)"
            " ON CONFLICT(deadline_type) DO UPDATE SET lead_days = excluded.lead_days",
            (dtype, json.dumps(leads)),
        )

    def all_defaults(self) -> dict[str, list[int]]:
        return {r["deadline_type"]: json.loads(r["lead_days"]) for r in
                self.v.rows("SELECT deadline_type, lead_days FROM reminder_default")}  # fmt: skip

    @staticmethod
    def _clean_leads(leads) -> list[int]:
        if not isinstance(leads, list) or not all(
            isinstance(x, int) and not isinstance(x, bool) and 0 <= x <= 365 for x in leads
        ):
            raise _bad("Vorlaufzeiten sind ganze Tage zwischen 0 und 365.")
        return sorted(set(leads), reverse=True)

    def _validate(self, spec: dict, existing: dict | None = None) -> dict:
        from .repo import DEADLINE_TYPES

        merged = {**(existing or {}), **spec}
        if merged.get("type") not in DEADLINE_TYPES:
            raise _bad("Bitte eine gültige Fristart wählen.")
        if not valid_iso_date(merged.get("due_date")):
            raise _bad("Das Fristdatum ist ungültig (JJJJ-MM-TT).")
        rm = merged.get("repeat_months") or 0
        if not isinstance(rm, int) or isinstance(rm, bool) or not 0 <= rm <= 120:
            raise _bad("Die Wiederholung ist in Monaten (0 bis 120) anzugeben.")
        leads = merged.get("lead_days")
        leads = self.default_leads(merged["type"]) if leads is None else self._clean_leads(leads)
        note = (merged.get("note") or "").strip()[:500] or None
        return {
            "type": merged["type"],
            "due_date": merged["due_date"],
            "repeat_months": rm,
            "lead_days": leads,
            "note": note,
        }

    def _make_reminders(self, deadline_id: int) -> None:
        d = self.v.row("SELECT due_date, lead_days FROM deadline WHERE id = ?", (deadline_id,))
        self.v.execute("DELETE FROM reminder WHERE deadline_id = ?", (deadline_id,))
        due = date.fromisoformat(d["due_date"])
        for lead in json.loads(d["lead_days"] or "[]"):
            self.v.execute(
                "INSERT OR IGNORE INTO reminder (deadline_id, lead_days, due_on) VALUES (?,?,?)",
                (deadline_id, lead, (due - timedelta(days=lead)).isoformat()),
            )

    def _row(self, deadline_id: int) -> dict:
        from .repo import NotFoundError

        row = self.v.row("SELECT * FROM deadline WHERE id = ?", (deadline_id,))
        if not row:
            raise NotFoundError("Die Frist")
        return row

    # ------------------------------------------------------------------ Anlegen/Aendern

    def add_suggestions(self, document_id: int, items: list[dict]) -> None:
        """Erkannte Fristen als unbestaetigten Vorschlag ablegen (keine Erinnerungen)."""
        self.v.execute(
            "DELETE FROM deadline WHERE document_id = ? AND confirmed = 0 AND source <> 'manuell'",
            (document_id,),
        )
        for it in items:
            if not valid_iso_date(it.get("due_date")):
                continue
            leads = it.get("lead_days") or self.default_leads(it["type"])
            self.v.execute(
                "INSERT INTO deadline (document_id, type, due_date, source, confirmed, repeat_months,"
                " lead_days, status, note, confidence, created_at) VALUES (?,?,?,?,0,?,?,'offen',?,?,?)",
                (document_id, it["type"], it["due_date"], it.get("source", "regex"),
                 int(it.get("repeat_months") or 0), json.dumps(leads), it.get("note"),
                 it.get("confidence"), now_iso()),
            )  # fmt: skip

    def suggestions(self, document_id: int) -> list[dict]:
        return [self._public(r) for r in self.v.rows(
            "SELECT * FROM deadline WHERE document_id = ? ORDER BY due_date, id", (document_id,))]  # fmt: skip

    def save_from_review(self, document_id: int, spec: dict) -> int | None:
        """Pruefschritt: Vorschlag bestaetigen/anpassen, neue Frist anlegen oder verwerfen."""
        if spec.get("remove"):
            if spec.get("id"):
                dl = self._row(spec["id"])
                if dl["document_id"] != document_id:
                    raise _bad("Diese Frist gehört nicht zum Dokument.")
                self._delete(spec["id"])
            return None
        if spec.get("id"):
            dl = self._row(spec["id"])
            if dl["document_id"] != document_id:
                raise _bad("Diese Frist gehört nicht zum Dokument.")
            data = self._validate(spec, {**dl, "lead_days": json.loads(dl["lead_days"] or "null")})
            self.v.execute(
                "UPDATE deadline SET type=?, due_date=?, repeat_months=?, lead_days=?, note=?,"
                " confirmed=1 WHERE id=?",
                (data["type"], data["due_date"], data["repeat_months"], json.dumps(data["lead_days"]),
                 data["note"], spec["id"]),
            )  # fmt: skip
            did = spec["id"]
        else:
            did = self._insert(document_id, spec, "manuell")
        paid = self.v.scalar("SELECT paid FROM document WHERE id = ?", (document_id,))
        if paid and self._row(did)["type"] == "zahlungsziel":
            self.v.execute("UPDATE deadline SET status = 'erledigt' WHERE id = ?", (did,))
        else:
            self._make_reminders(did)
        self.v.audit("deadline.saved", document_id=document_id)
        return did

    def _insert(
        self, document_id: int, spec: dict, source: str, parent_id: int | None = None
    ) -> int:
        data = self._validate(spec)
        cur = self.v.execute(
            "INSERT INTO deadline (document_id, type, due_date, source, confirmed, repeat_months,"
            " lead_days, status, note, parent_id, created_at) VALUES (?,?,?,?,1,?,?,'offen',?,?,?)",
            (document_id, data["type"], data["due_date"], source, data["repeat_months"],
             json.dumps(data["lead_days"]), data["note"], parent_id, now_iso()),
        )  # fmt: skip
        return cur.lastrowid

    def create(self, document_id: int, spec: dict) -> dict:
        self.repo._doc_row(document_id)
        with self.v.tx():
            did = self._insert(document_id, spec, "manuell")
            self._make_reminders(did)
            self.v.audit("deadline.created", document_id=document_id)
        return self.get(did)

    def update(self, deadline_id: int, spec: dict) -> dict:
        dl = self._row(deadline_id)
        data = self._validate(spec, {**dl, "lead_days": json.loads(dl["lead_days"] or "null")})
        with self.v.tx():
            self.v.execute(
                "UPDATE deadline SET type=?, due_date=?, repeat_months=?, lead_days=?, note=?,"
                " status = CASE WHEN status = 'abgelaufen' AND ? >= ? THEN 'offen' ELSE status END"
                " WHERE id=?",
                (data["type"], data["due_date"], data["repeat_months"], json.dumps(data["lead_days"]),
                 data["note"], data["due_date"], self.repo.today().isoformat(), deadline_id),
            )  # fmt: skip
            self.v.execute(
                "DELETE FROM reminder WHERE deadline_id = ? AND state <> 'offen'", (deadline_id,)
            )
            if dl["confirmed"]:
                self._make_reminders(deadline_id)
            self.v.audit("deadline.changed", document_id=dl["document_id"])
        return self.get(deadline_id)

    def _delete(self, deadline_id: int) -> None:
        self.v.execute("UPDATE deadline SET parent_id = NULL WHERE parent_id = ?", (deadline_id,))
        self.v.execute("DELETE FROM reminder WHERE deadline_id = ?", (deadline_id,))
        self.v.execute("DELETE FROM deadline WHERE id = ?", (deadline_id,))

    def delete(self, deadline_id: int) -> None:
        dl = self._row(deadline_id)
        with self.v.tx():
            self._delete(deadline_id)
            self.v.audit("deadline.removed", document_id=dl["document_id"])

    def complete(self, deadline_id: int, done: bool = True) -> dict:
        dl = self._row(deadline_id)
        if (
            not done
            and dl["type"] == "zahlungsziel"
            and self.v.scalar("SELECT paid FROM document WHERE id = ?", (dl["document_id"],))
        ):
            raise _bad(
                "Diese Zahlungsfrist ist als bezahlt markiert. Markiere das Dokument zuerst wieder als offen.",
                "bereits_bezahlt",
                409,
            )
        with self.v.tx():
            self.v.execute(
                "UPDATE deadline SET status = ? WHERE id = ?",
                ("erledigt" if done else "offen", deadline_id),
            )
            if done:
                self.v.execute(
                    "UPDATE reminder SET state = 'erledigt' WHERE deadline_id = ? AND state <> 'erledigt'",
                    (deadline_id,),
                )
            else:
                self._make_reminders(deadline_id)
            self.v.audit(
                "deadline.completed" if done else "deadline.reopened", document_id=dl["document_id"]
            )
        return self.get(deadline_id)

    def on_paid_changed(self, document_id: int, paid: bool) -> None:
        rows = self.v.rows(
            "SELECT id FROM deadline WHERE document_id = ? AND type = 'zahlungsziel' AND confirmed = 1",
            (document_id,),
        )
        for r in rows:
            if paid:
                self.v.execute("UPDATE deadline SET status = 'erledigt' WHERE id = ?", (r["id"],))
                self.v.execute(
                    "UPDATE reminder SET state = 'erledigt' WHERE deadline_id = ?", (r["id"],)
                )
            else:
                self.v.execute(
                    "UPDATE deadline SET status = 'offen' WHERE id = ? AND status = 'erledigt'",
                    (r["id"],),
                )
                self._make_reminders(r["id"])

    # ------------------------------------------------------------------ Lesen

    def _public(self, r: dict) -> dict:
        today = self.repo.today()
        due = date.fromisoformat(r["due_date"])
        out = {
            "id": r["id"],
            "document_id": r["document_id"],
            "type": r["type"],
            "due_date": r["due_date"],
            "confirmed": bool(r["confirmed"]),
            "status": r["status"],
            "repeat_months": r["repeat_months"],
            "lead_days": json.loads(r["lead_days"] or "[]"),
            "note": r["note"],
            "source": r["source"],
            "confidence": r["confidence"],
            "days_left": (due - today).days,
            "overdue": r["status"] == "offen" and due < today,
        }
        for k in ("company_name", "doc_type", "amount_cents", "original_name", "paid"):
            if k in r:
                out[k] = r[k]
        return out

    def get(self, deadline_id: int) -> dict:
        self._row(deadline_id)
        return self._public(self.v.row(self._JOIN + " WHERE dl.id = ?", (deadline_id,)))

    _JOIN = (
        "SELECT dl.*, c.name AS company_name, d.doc_type, d.amount_cents, d.original_name, d.paid"
        " FROM deadline dl JOIN document d ON d.id = dl.document_id"
        " LEFT JOIN company c ON c.id = d.company_id"
    )

    def list(
        self,
        *,
        within_days: int | None = None,
        include_overdue: bool = True,
        status: str | None = "offen",
        dtype: str | None = None,
    ) -> list[dict]:
        where = ["dl.confirmed = 1", "d.state = 'geprueft'", "d.archived = 0"]
        params: list = []
        if status:
            where.append("dl.status = ?")
            params.append(status)
        if dtype:
            where.append("dl.type = ?")
            params.append(dtype)
        today = self.repo.today()
        if within_days is not None:
            where.append("dl.due_date <= ?")
            params.append((today + timedelta(days=within_days)).isoformat())
        if not include_overdue:
            where.append("dl.due_date >= ?")
            params.append(today.isoformat())
        rows = self.v.rows(
            f"{self._JOIN} WHERE {' AND '.join(where)} ORDER BY dl.due_date, dl.id", params
        )
        return [self._public(r) for r in rows]

    # ------------------------------------------------------------------ Planer

    def _cancelled(self, document_id: int) -> bool:
        return bool(
            self.v.scalar(
                "SELECT count(*) FROM document_link l JOIN document o ON o.id ="
                " CASE WHEN l.from_id = ? THEN l.to_id ELSE l.from_id END"
                " WHERE (l.from_id = ? OR l.to_id = ?) AND l.status = 'bestaetigt'"
                f" AND o.doc_type IN ({','.join('?' * len(CANCEL_TYPES))})",
                (document_id, document_id, document_id, *CANCEL_TYPES),
            )
        )

    def tick(self) -> dict:
        """Vom Scheduler aufgerufen (beim Start und minuetlich). Idempotent."""
        today = self.repo.today()
        iso = today.isoformat()
        fired: list[int] = []
        with self.v.tx():
            self._roll_repeats(today)
            rows = self.v.rows(
                "SELECT r.id, r.deadline_id, r.due_on, r.state FROM reminder r"
                " JOIN deadline dl ON dl.id = r.deadline_id JOIN document d ON d.id = dl.document_id"
                " WHERE r.state IN ('offen','zurueckgestellt') AND dl.status = 'offen'"
                " AND dl.confirmed = 1 AND d.state = 'geprueft' AND d.archived = 0 AND d.paid = 0"
                " AND ((r.state = 'offen' AND r.due_on <= ?)"
                "   OR (r.state = 'zurueckgestellt' AND r.snoozed_until <= ?))"
                " ORDER BY r.deadline_id, r.due_on DESC, r.id DESC",
                (iso, iso),
            )
            seen: set[int] = set()
            for r in rows:
                if r["deadline_id"] in seen:
                    self.v.execute(
                        "UPDATE reminder SET state = 'erledigt' WHERE id = ?", (r["id"],)
                    )
                    continue
                seen.add(r["deadline_id"])
                already = self.v.scalar(
                    "SELECT count(*) FROM reminder WHERE deadline_id = ? AND state = 'angezeigt'",
                    (r["deadline_id"],),
                )
                if already:
                    self.v.execute(
                        "UPDATE reminder SET state = 'erledigt' WHERE id = ?", (r["id"],)
                    )
                    continue
                self.v.execute(
                    "UPDATE reminder SET state = 'angezeigt', shown_at = ? WHERE id = ?",
                    (now_iso(), r["id"]),
                )
                fired.append(r["id"])
        return {"fired": fired}

    def _roll_repeats(self, today: date) -> None:
        passed = self.v.rows(
            "SELECT dl.* FROM deadline dl JOIN document d ON d.id = dl.document_id"
            " WHERE dl.confirmed = 1 AND dl.status = 'offen' AND dl.due_date < ?"
            " AND dl.type IN ('vertragsende','kuendigungsfrist','sonstige') AND d.archived = 0",
            (today.isoformat(),),
        )
        for dl in passed:
            self.v.execute("UPDATE deadline SET status = 'abgelaufen' WHERE id = ?", (dl["id"],))
            self.v.execute(
                "UPDATE reminder SET state = 'erledigt' WHERE deadline_id = ? AND state <> 'erledigt'",
                (dl["id"],),
            )
            if not dl["repeat_months"] or self._cancelled(dl["document_id"]):
                continue
            due = date.fromisoformat(dl["due_date"])
            step = 0
            while due < today:
                step += 1
                due = add_months(date.fromisoformat(dl["due_date"]), dl["repeat_months"] * step)
            exists = self.v.scalar("SELECT count(*) FROM deadline WHERE parent_id = ?", (dl["id"],))
            if exists:
                continue
            nid = self._insert(
                dl["document_id"],
                {
                    "type": dl["type"],
                    "due_date": due.isoformat(),
                    "repeat_months": dl["repeat_months"],
                    "lead_days": json.loads(dl["lead_days"] or "[]"),
                    "note": dl["note"],
                },
                "wiederholung",
                parent_id=dl["id"],
            )
            self._make_reminders(nid)

    # --- Erinnerungen im UI

    def due_reminders(self) -> list[dict]:
        rows = self.v.rows(
            "SELECT r.id AS reminder_id, r.lead_days AS lead, r.shown_at, dl.*, c.name AS company_name,"
            " d.doc_type, d.amount_cents, d.original_name, d.paid FROM reminder r"
            " JOIN deadline dl ON dl.id = r.deadline_id JOIN document d ON d.id = dl.document_id"
            " LEFT JOIN company c ON c.id = d.company_id WHERE r.state = 'angezeigt'"
            " AND d.archived = 0 ORDER BY dl.due_date, r.id"
        )
        out = []
        for r in rows:
            item = self._public(r)
            item["reminder_id"] = r["reminder_id"]
            item["lead"] = r["lead"]
            item["shown_at"] = r["shown_at"]
            out.append(item)
        return out

    def _reminder(self, reminder_id: int) -> dict:
        from .repo import NotFoundError

        r = self.v.row("SELECT * FROM reminder WHERE id = ?", (reminder_id,))
        if not r:
            raise NotFoundError("Die Erinnerung")
        return r

    def dismiss(self, reminder_id: int) -> None:
        self._reminder(reminder_id)
        self.v.execute("UPDATE reminder SET state = 'erledigt' WHERE id = ?", (reminder_id,))

    def snooze(self, reminder_id: int, days: int) -> None:
        self._reminder(reminder_id)
        if not isinstance(days, int) or not 1 <= days <= 90:
            raise _bad("Zurückstellen ist für 1 bis 90 Tage möglich.")
        until = (self.repo.today() + timedelta(days=days)).isoformat()
        self.v.execute(
            "UPDATE reminder SET state = 'zurueckgestellt', snoozed_until = ? WHERE id = ?",
            (until, reminder_id),
        )

    def take_notifications(self) -> list[dict]:
        """Noch nicht gemeldete Erinnerungen fuer Desktop-Benachrichtigungen (einmalig)."""
        items = [i for i in self.due_reminders() if not self.v.scalar(
            "SELECT notified FROM reminder WHERE id = ?", (i["reminder_id"],))]  # fmt: skip
        with self.v.tx():
            for i in items:
                self.v.execute("UPDATE reminder SET notified = 1 WHERE id = ?", (i["reminder_id"],))
        return items
