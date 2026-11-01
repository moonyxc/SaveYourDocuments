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

## 5. Sonstiges

- [ ] Schriften Inter/JetBrains Mono lokal mitliefern (Lizenz prüfen), bisher Systemschrift-Fallback
- [ ] Offene Fragen aus `PLAN.md` Abschnitt 8 (aktuell Arbeitsannahmen) mit dem Nutzer bestätigen
