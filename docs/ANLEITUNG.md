# Anleitung für Anwender

Save Your Documents sammelt deine wichtigen Dokumente an einem Ort: Rechnungen, Versicherungspapiere, Verträge, Bescheide. Das Programm liest sie, sortiert sie vor, erinnert dich an Fristen und zeigt, wie viel du wofür ausgibst. **Nichts verlässt deinen Computer.**

## Installieren

1. Die Datei `Save Your Documents_1.0.0_x64-setup.exe` doppelklicken.
2. Zeigt Windows „Der Computer wurde durch Windows geschützt“, auf **Weitere Informationen** und dann **Trotzdem ausführen** klicken. Das passiert, weil der Installer nicht kostenpflichtig signiert ist.
3. Nach der Installation startet das Programm. Es läuft danach unten rechts im Infobereich (Tray) und startet mit Windows. Das Fenster zu schließen beendet es nicht.

## Erster Start

Ein Assistent richtet dein Archiv ein.

- **Schlüssel (empfohlen):** Das Programm öffnet das Archiv automatisch. Du bekommst einen **Wiederherstellungsschlüssel**. Speichere oder drucke ihn und bewahre ihn getrennt vom Computer auf. Ohne ihn kannst du eine Sicherung auf einem neuen Computer nicht öffnen. Zur Kontrolle tippst du ihn einmal ein.
- **Passwort:** Das Programm fragt bei jedem Start danach. Empfang vom Handy und Erinnerungen laufen erst danach. Ein vergessenes Passwort lässt sich nicht zurücksetzen.

## Dokumente hineinbringen

**Vom Handy (empfohlen):**

1. Installiere die kostenlose App **LocalSend** auf dem Handy. Handy und Computer müssen im selben WLAN sein.
2. Fotografiere das Dokument, wähle in LocalSend **„Save Your Documents“** als Empfänger und sende die Fotos.
3. Beim ersten Mal fragt das Programm, ob es das Gerät annehmen soll. Mit **Annehmen und Gerät vertrauen** fragt es künftig nicht mehr (wenn in den Einstellungen aktiviert).
4. Fragt Windows nach der Firewall, erlaube den Zugriff im privaten Netzwerk. Das Programm kann die Regel in **Einstellungen → Empfang vom Handy** auch selbst anlegen.

**Vom Computer:** Auf **Fotos sortieren** Dateien hineinziehen oder auswählen. Bilder, PDFs und iPhone-Fotos (HEIC) funktionieren.

## Sortieren, erkennen, prüfen

1. **Fotos sortieren:** Wähle Fotos, die zu **einem** Dokument gehören (zum Beispiel drei Seiten eines Briefs), und fasse sie zusammen. Dann **Erkennung starten**.
2. Das Programm liest den Text und rät Art, Firma, Datum, Betrag und Fristen.
3. **Prüfen:** Du siehst das Original neben den erkannten Angaben. Orange umrandete Felder sind unsicher. Korrigiere, was nicht stimmt, und bestätige. Erst bestätigte Dokumente zählen in Auswertungen und lösen Erinnerungen aus.
4. Ist eine Firma neu, fragt das Programm nach. Sieht eine Firma einer bekannten ähnlich, kannst du sie zusammenführen oder getrennt lassen.

Das Original bleibt immer unverändert gespeichert.

## Alltag

- **Start:** Was heute zu tun ist, was bald fällig wird und Warnungen.
- **Dokumente:** Suche nach Firma, Betrag oder Stichwort; Filter, Tags, Archiv. „Bezahlt“ lässt sich markieren.
- **Fristen:** Zahlungen und Kündigungen als Zeitleiste. Erinnerungen erscheinen als Windows-Benachrichtigung, standardmäßig Zahlung 7 und 1 Tag vorher, Kündigung 30 und 7 Tage vorher. Sich wiederholende Fristen entstehen automatisch neu.
- **Auswertung:** Ausgaben pro Firma, Bereich und Jahr. Nur Euro, nur geprüfte Dokumente. CSV-Export ist möglich.
- **Exportieren:** Dokumente in eine echte Ordnerstruktur kopieren (nach einer Vorlage) oder als ZIP laden. **Exportierte Dateien sind nicht verschlüsselt.**

Dokumente werden **nie gelöscht**, nur archiviert.

## Sichern und Wiederherstellen

- Das Programm sichert automatisch, mindestens täglich, und behält die letzten Sicherungen. Ziel und Anzahl stehen unter **Einstellungen → Sicherung & Speicher**.
- **Wichtig:** Kopiere ab und zu eine Sicherung auf einen USB-Stick oder eine externe Festplatte. Eine Sicherung auf demselben Computer schützt nicht vor einem Festplattenschaden.
- **Wiederherstellen:** Programm beenden (Tray → Beenden), die Sicherungsdatei als `archiv.syd` in den Datenordner kopieren, Programm starten und den Wiederherstellungsschlüssel (oder das Passwort) eingeben. Auf einem neuen Computer wählst du beim ersten Start **Ich habe schon ein Archiv**.
- Die Prüfung der Archivdatei läuft automatisch einmal pro Woche. Findet sie einen Fehler, erscheint eine Warnung auf der Startseite: dann eine Sicherung einspielen.

## Beenden und Deinstallieren

- **Beenden:** Tray-Symbol rechtsklicken → **Beenden**. Danach gibt es keinen Handy-Empfang und keine Erinnerungen.
- **Deinstallieren:** über Windows **Einstellungen → Apps**. Dein Archiv bleibt im Datenordner erhalten.

## Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| Das Handy findet den Computer nicht | Gleiches WLAN? Firewall-Regel anlegen (Einstellungen → Empfang vom Handy). Manche Router trennen WLAN-Geräte voneinander („Client-Isolation“). |
| „Der Port ist belegt“ | Die LocalSend-App läuft selbst auf dem Computer. Beende sie. |
| Die Erkennung ist schlecht | Foto gerade, bei Tageslicht, ohne Schatten, ganze Seite. Oder per Hand ausfüllen. |
| Schlüssel verloren | Solange das Programm läuft, funktioniert alles. Lege sofort über **Einstellungen → Sicherheit** einen neuen Schlüssel an. |
