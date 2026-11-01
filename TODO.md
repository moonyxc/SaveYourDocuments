# Offene Punkte

Stand: Die in dieser Windows-Umgebung ausführbaren Prüfungen sind teilweise abgehakt. Offen bleiben Tests mit Installer, echten Geräten oder echten Dokumenten. Details: `docs/SPIKES.md`, `PLAN.md` Abschnitt 10.

## 1. Tests unter Windows (teilweise durchführbar)

- [x] Gebauten NSIS-Installer installieren, starten, deinstallieren
- [x] Neuinstallation über eine laufende Version
- [x] PyInstaller-Dienst: baut und startet er (Windows-Wheel für `sqlcipher3`, gewählte Python-Version)
- [x] Tray-Symbol, Autostart, Einzelinstanz (Tray nur indirekt: Start bricht bei Fehler ab, Fenster-Schließen lässt Prozess und Backend laufen; Symbol selbst bitte einmal per Auge prüfen)
- [ ] Windows-Benachrichtigungen
- [x] Schlüssel an das Windows-Konto binden (DPAPI)
- [ ] Windows-Firewall-Regel für LocalSend
- [x] SmartScreen-Verhalten (unsignierter Installer)
- [x] „Release-Seite öffnen“ öffnet den Standardbrowser (`webbrowser.open`)
- [ ] USB-Test: Archiv auf exFAT/NTFS, FAT32-Limit, Öffnen an einem zweiten PC
- [x] Blob-Benchmark auf Windows (`python scripts/bench_blobs.py 500 4`)

Windows-Lauf (01.11.2026, Python 3.11): Backend 84 bestanden, 3 übersprungen; Ruff und Frontend-Build erfolgreich. DPAPI-Rundlauf erfolgreich. Der Blob-Benchmark mit 500 Fotos à 4 MB ergab 123 MB/s Schreiben, 406 MB/s Lesen und einen erfolgreichen Integritätstest.Installer-Lauf (Windows 10 Pro 26200, ohne Administratorrechte, Python 3.11.15; Rust, NSIS, Tesseract, MSVC Build Tools per winget nachinstalliert): `scripts/build-windows.ps1` baut Installer (71,5 MiB, unsigniert). `smoke-backend.py` gegen die gebaute Exe: OK. Stiller Install, Start (Fenster, ein Backend, nur 127.0.0.1), zweiter Start (beendet sich, Einzelinstanz), Neuinstallation über die laufende App und Deinstallation bei laufender App (Prozesse beendet, Ordner und Registry-Eintrag weg) liefen fehlerfrei. Autostart-Run-Eintrag beim ersten Start gesetzt. Gefundener und behobener Fehler: Das eingefrorene Backend startete nicht (`DLL load failed while importing _ssl`), weil PyInstaller die OpenSSL-DLL von Tesseract aus dem PATH statt der von Python einsammelte (Fix in `backend/packaging/syd-backend.spec`).

Offen und beobachtet: Nach Deinstallation entfernt der Uninstaller den Autostart-Eintrag, aber die Markerdatei `autostart-eingerichtet` im Datenordner bleibt. Bei Neuinstallation wird Autostart deshalb nicht erneut eingeschaltet (nur über das Tray-Menü).

Nicht ausgeführt: Firewall-Regel (braucht UAC-Bestätigung, es wurde keine Regel angelegt), Benachrichtigungen (brauchen echte Frist bei entsperrtem Archiv), USB/exFAT/FAT32 (kein Laufwerk, kein zweiter PC), SmartScreen (Installer ist unsigniert, nur Signaturstatus `NotSigned` geprüft).

## 2. LocalSend im echten Netz

- [ ] Empfang mit der echten LocalSend-App auf dem Handy
- [ ] Multicast/Discovery im Heimnetz (UDP-Socket wirklich binden, `start_multicast` ist nur per Handler-Test abgedeckt)
- [ ] PIN-Wiederholungsschutz ergänzen und prüfen
- [ ] Quarantäne unter `staging/localsend` liegt bis zur Bestätigung unverschlüsselt: verschlüsseln oder bewusst akzeptieren

## 3. Erkennung mit echten Dokumenten (S3/S4)

- [ ] Gold-Set ist synthetisch (alle Felder 100 %): mit echten Fotos/Scans neu messen
- [ ] Erkennungsqualität pro Dokumenttyp prüfen, Schwächen nachbessern
- [ ] Abnahmekriterien aus `PLAN.md` Abschnitt 5 komplett durchgehen

## 4. Update-Funktion

- [ ] Erstes GitHub-Release anlegen (Tag `vX.Y.Z`), damit der echte Pfad testbar wird (aktuell Ergebnis `kein_release`)
- [ ] Prüfen: Version erhöhen, Release veröffentlichen, App meldet „Update verfügbar“
- [ ] Update-Funktion in `PLAN.md` und `docs/SPIKES.md` erwähnen

## 5. Weitere Punkte aus PLAN.md

- [x] `scripts/smoke-backend.py` gegen die gebaute Windows-Exe laufen lassen (S1)
- [ ] Code-Signing des Installers, SmartScreen prüfen
- [ ] Performance-Test mit 10.000+ Dokumenten
- [ ] OCR-Vergleich Tesseract gegen Alternativen unter Windows (S4)
- [ ] Sicherheitsreview formal abhaken (Sidecar nur 127.0.0.1, Token, minimale Tauri-Rechte, LocalSend-Port nur im LAN)
- [ ] Abnahme der Oberfläche durch Nils

## 6. Entscheidungen von Nils (PLAN.md Abschnitt 8, bis dahin Arbeitsannahmen)

- [ ] Originalformat: unverändert mit optionalem „Platz sparen“ oder verkleinern?
- [ ] DESIGN.md-Kontraste auf 4,5:1 anpassen oder unverändert lassen?
- [ ] Schriftgröße: 14 px oder 16 px mit einstellbarer Größe?
- [ ] Hell-Variante später ergänzen?
- [ ] Gold-Set (S3): 30 echte Dokumente sammeln und anonymisieren, auch schlechte Handyfotos und mehrseitige Briefe

## 7. Neue Funktion: Weihnachtsmodus

- [ ] Button (an/aus) in den Einstellungen, Zustand als Einstellung speichern
- [ ] Bei „an“: Weihnachtsmützen (z. B. auf Logo/Symbolen) und Lichterketten (z. B. am oberen Rand und an Karten) passend zum Design anzeigen
- [ ] Rein dekorativ, lokal (keine externen Bilder), Kontrast und Lesbarkeit bleiben erhalten
- [ ] Bewegung abschaltbar (`prefers-reduced-motion`)

## 8. Sonstiges

- [ ] Schriften Inter/JetBrains Mono lokal mitliefern (Lizenz prüfen), bisher Systemschrift-Fallback
- [ ] Offene Fragen aus `PLAN.md` Abschnitt 8 (aktuell Arbeitsannahmen) mit dem Nutzer bestätigen
