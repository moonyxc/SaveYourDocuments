# SaveYourDocuments – Projektstatus

## Ziel und Stand

Die App ist als Electron + React + TypeScript Desktop-Anwendung für die Verwaltung, OCR-Erkennung und Kategorisierung von Dokumenten umgesetzt. Die Kernfunktionalität umfasst:

- Dokument-Upload und lokale Speicherung
- OCR-Erkennung mit Tesseract und optionalem Vision-Fallback
- Extraktion von Datum und Betrag
- Validierung durch den Nutzer
- Suche und Filterung
- Passwortgeschützte Zugriffssperre
- Persistente lokale Speicherung in einer SQLite-Datei

## Wichtige technische Hinweise

- Die App nutzt Electron + Vite für Desktop- und UI-Entwicklung.
- Die Daten liegen lokal im User-Data-Verzeichnis der App.
- Die Dateien werden verschlüsselt gespeichert.
- Die DB- und OCR-Logik läuft im Main Process.
- Der Renderer greift nur über einen sicheren Preload-Bridge auf die APIs zu.

## Verifiziert

Die folgenden Prüfungen wurden erfolgreich ausgeführt:

- `npm run build` → erfolgreich
- `npm test -- --run` → 48/48 Tests bestanden

## Bekannte Einschränkungen

- Das Vision-Modell ist als optionaler Fallback geplant, aber noch nicht vollständig implementiert.
- Die Lint-Toolchain benötigt eine TypeScript-Version, die mit `@typescript-eslint` kompatibel ist. Daher wurde TypeScript auf eine kompatible Version herabgesetzt.
- Die App ist lokal und nicht cloudbasiert; es gibt keine externe Synchronisation.

## Nächste sinnvolle Schritte

1. Vision-Modell-Download und echte Fallback-Logik verifizieren.
2. Entwickler-Tools für Logs und Datenbankstatus vollständig ausbauen.
3. Such-/Filter-/Tag-Funktionen mit realen Dokumentdaten verfeinern.
4. UX für Validierungs-Modal und Dokumentverknüpfung erweitern.
5. Build + Release-Prozess mit Windows-Installer weiter absichern.
