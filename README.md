# Save Your Documents

Ein lokales Programm für Windows 11, das wichtige Dokumente (Versicherung, Kauf, Behörden, Verträge) vom Handy oder per Upload entgegennimmt, **selbst erkennt**, was es ist, und alles durchsuchbar in **einer verschlüsselten Datei** speichert. Es erinnert an Zahlungs- und Kündigungsfristen und wertet Ausgaben aus.

- **Strikt lokal:** keine Cloud, kein Konto, kein KI-Dienst im Internet. Die Texterkennung läuft auf deinem Computer. Nur die Suche nach Updates fragt auf Wunsch die öffentliche Release-Liste bei GitHub ab (ohne Daten aus dem Archiv).
- **Eine Datei:** das ganze Archiv (Originale, Texte, Vorschaubilder, Daten) liegt verschlüsselt in `archiv.syd`. Kopieren = sichern.
- **Nie löschen, nur archivieren.**
- **Deutsch**, dunkle Oberfläche, für Laien gemacht.

## Für Anwender

Installation, erster Start und Alltag: [docs/ANLEITUNG.md](docs/ANLEITUNG.md).

## Aufbau

| Teil | Ordner | Technik |
|---|---|---|
| Hülle (Tray, Autostart, Einzelinstanz, Benachrichtigungen) | `src-tauri/` | Tauri 2 (Rust) |
| Hintergrunddienst (API, Verschlüsselung, Erkennung, LocalSend) | `backend/` | Python, FastAPI, SQLCipher, Tesseract |
| Oberfläche | `frontend/` | React, TypeScript, Vite, Tailwind |
| Klickprototyp (historisch) | `prototype/` | HTML |

Die Hülle startet den Hintergrunddienst als Prozess, bekommt über `SYD_READY {"port": …}` den Port und öffnet ein Fenster auf `http://127.0.0.1:<port>`. Ein zufälliges Token, das nur die Hülle kennt, schützt jede Anfrage. Der Dienst hört ausschließlich auf `127.0.0.1`.

Planung und Entscheidungen: [PLAN.md](PLAN.md), Designsystem: [DESIGN.md](DESIGN.md), Messergebnisse und Stand der Spikes: [docs/SPIKES.md](docs/SPIKES.md).

## Entwickeln

Alles dazu: [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md). Kurzfassung:

```bash
cd backend && python -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/pytest -q                              # Tests (OCR-Tests brauchen Tesseract mit deu)
cd ../frontend && npm ci && npm run build        # Oberfläche nach frontend/dist
cd ../backend && .venv/bin/python -m syd.main    # öffnet http://127.0.0.1:<port>/#token=…
```

## Stand

Backend, Oberfläche und Hülle sind vollständig geschrieben. Auf Linux getestet sind das Backend (Tests, echte OCR), die Oberfläche (Ende-zu-Ende im Browser) und der Rust-Code (`cargo check`). **Nicht auf Windows 11 getestet** sind der gebaute Installer, DPAPI, die Firewall-Regel, Tray und Autostart sowie die echte LocalSend-App. Details und Abnahmeliste: [docs/SPIKES.md](docs/SPIKES.md).

## Lizenz

Siehe [LICENSE](LICENSE).
