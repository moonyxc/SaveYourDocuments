# Offene Punkte

Stand: Alles Programmierbare ist umgesetzt. Offen ist, was nur auf Windows 11, mit echten Geräten oder echten Dokumenten geprüft werden kann. Details: `docs/SPIKES.md`, `PLAN.md` Abschnitt 10.

## 1. Tests unter Windows 11 (nicht prüfbar im Codespace)

- [ ] Gebauten NSIS-Installer installieren, starten, deinstallieren
- [ ] Neuinstallation über eine laufende Version
- [ ] PyInstaller-Dienst: baut und startet er (Windows-Wheel für `sqlcipher3`, gewählte Python-Version)
- [ ] Tray-Symbol, Autostart, Einzelinstanz
- [ ] Windows-Benachrichtigungen
- [ ] Schlüssel an das Windows-Konto binden (DPAPI)
- [ ] Windows-Firewall-Regel für LocalSend
- [ ] SmartScreen-Verhalten (unsignierter Installer)
- [ ] „Release-Seite öffnen“ öffnet den Standardbrowser (`webbrowser.open`)
- [ ] USB-Test: Archiv auf exFAT/NTFS, FAT32-Limit, Öffnen an einem zweiten PC
- [ ] Blob-Benchmark auf Windows (`python scripts/bench_blobs.py 500 4`)

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

- [ ] `scripts/smoke-backend.py` gegen die gebaute Windows-Exe laufen lassen (S1)
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
