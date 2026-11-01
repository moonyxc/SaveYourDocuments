# GitHub-API: Versionsprüfung und Release-Auswahl

Diese Dokumentation beschreibt eine programm- und sprachunabhängige Logik für Versionsprüfungen über GitHub Releases. Sie setzt lediglich eine bekannte aktuelle Programmversion und ein GitHub-Repository voraus. Wie die aktuelle Version ermittelt wird, ist nicht Bestandteil.

## Eingaben

- **Repository:** GitHub-Eigentümer (`owner`) und Repository-Name (`repo`).
- **Aktuelle Version:** die Version des ausgeführten Programms.
- **Update-Kanal:** nur stabile Releases oder auch Vorabversionen.
- **Versionsschema:** eine festgelegte Vergleichsregel, beispielsweise Semantic Versioning.

## GitHub-API-Endpunkte

Basisadresse: `https://api.github.com`.

| Zweck | Anfrage | Antwort |
|---|---|---|
| Releases für eigene Filter- und Vergleichsregeln abrufen | `GET /repos/{owner}/{repo}/releases?per_page=100` | Liste von Releases |
| Das von GitHub als „latest“ bestimmte stabile Release abrufen | `GET /repos/{owner}/{repo}/releases/latest` | Einzelnes Release; keine Vorabversion und kein Entwurf |
| Ein bestimmtes Release abrufen | `GET /repos/{owner}/{repo}/releases/tags/{tag}` | Einzelnes Release zum angegebenen Tag |

Für eine selbst bestimmte höchste Version oder einen Beta-Kanal ist die Release-Liste erforderlich. Die Reihenfolge der Liste und die Auswahl von `/latest` ersetzen keinen eigenen Versionsvergleich.

Relevante Antwortfelder:

| Feld | Bedeutung |
|---|---|
| `tag_name` | Originaler Release-Tag, aus dem die Versionsnummer abgeleitet wird |
| `prerelease` | Kennzeichnet eine Vorabversion, beispielsweise Beta oder Release Candidate |
| `draft` | Kennzeichnet einen noch nicht veröffentlichten Entwurf |
| `html_url` | Link zur Release-Seite |

Anfragen verwenden einen aussagekräftigen `User-Agent` und `Accept: application/vnd.github+json`. Für öffentliche Releases ist eine Abfrage ohne Authentifizierung möglich; private Repositorys benötigen passende Zugriffsrechte. Ein Token darf nicht fest in einem verteilten Programm hinterlegt werden.

Bei mehreren Ergebnisseiten wird dem `Link`-Header mit `rel="next"` gefolgt, bis alle für die Auswahl benötigten Releases vorliegen. Eine einzelne Seite garantiert nicht, dass die höchste passende Version enthalten ist.

## Versionsvergleich

Aktuelle Version und Release-Tags müssen nach demselben Schema interpretiert werden. Ein optionales führendes `v` kann vor dem Vergleich entfernt werden; der Originaltag bleibt für spätere API-Anfragen erhalten. Nicht interpretierbare Tags werden nicht als Update-Kandidaten verwendet.

Bei Semantic Versioning gelten diese Regeln:

- Haupt-, Neben- und Patchversion werden numerisch verglichen: `2.0.0` ist neuer als `1.10.0`.
- Bei gleicher Versionsnummer ist eine stabile Version neuer als eine Vorabversion: `2.0.0` ist neuer als `2.0.0-beta.1`.
- Vorabversionskennungen werden gemäß Semantic Versioning verglichen, nicht als einfache Gesamtzeichenfolge: `beta.10` ist neuer als `beta.2`.
- Build-Metadaten nach `+` verändern die Versionsrangfolge nicht.

Andere Versionsschemata benötigen eine eigene, konsistente Vergleichsregel. Projektspezifische Zusätze dürfen nicht pauschal entfernt werden, wenn sie für die Rangfolge relevant sind.

## Entscheidungsablauf

1. Die aktuelle Version und den gewünschten Update-Kanal übernehmen.
2. Veröffentlichte Releases über die API abrufen; Entwürfe ausschließen.
3. Tags anhand des festgelegten Versionsschemas interpretieren.
4. Kandidaten nach Kanal filtern: im stabilen Kanal nur `prerelease = false`, im Vorabversionskanal auch `prerelease = true`.
5. Die höchste zulässige Version durch Versionsvergleich bestimmen, unabhängig von der Reihenfolge der API-Antwort.
6. Diese Version mit der aktuellen Programmversion vergleichen. Nur eine höhere Version gilt als Update; gleiche oder niedrigere Versionen lösen kein Update aus.
7. Bei einem Update die Zielversion, den Originaltag, den Vorabversionsstatus und die Release-Seite als Ergebnis zurückgeben.

Optional können stabile Releases und Vorabversionen getrennt ausgewertet werden, um eine zusätzliche Beta-Version anzuzeigen. Ob eine stabile Version dann Vorrang hat, ist eine bewusst festzulegende Produktregel und keine Vorgabe der GitHub-API.

Die Versionsprüfung ist von einer Installation getrennt. Ein verfügbares Update bedeutet nicht automatisch, dass es installiert werden darf oder soll. Download und Installation sind nicht Bestandteil dieser Logik.

## Fehlerverhalten

Die Prüfung unterscheidet mindestens „Update verfügbar“, „kein neueres Release“, „kein passendes Release“ und „Prüfung fehlgeschlagen“. Ein Netzwerkfehler ist kein Nachweis, dass das Programm aktuell ist.

| Situation | Behandlung |
|---|---|
| Timeout oder Netzwerkfehler | Prüfung als fehlgeschlagen melden; das Programm kann weiterlaufen |
| `401` oder fehlende Zugriffsrechte | Authentifizierung beziehungsweise Berechtigungen prüfen |
| `403` oder `429` | Antwort und Rate-Limit-Header auswerten; bei einem Limit erst nach der angegebenen Wartezeit erneut abfragen |
| `404` | Repository, Zugriffsrechte und angefragtes Release prüfen; `/latest` kann auch ohne geeignetes stabiles Release fehlen |
| Leere Liste oder nur unpassende Tags | „Kein passendes Release“ melden |
| Ungültige Antwort oder nicht interpretierbare aktuelle Version | Prüfung als fehlgeschlagen melden |

Ein begrenztes Timeout, begrenzte Wiederholungen und ein angemessenes Prüfintervall verhindern blockierende oder unnötig häufige API-Anfragen.
