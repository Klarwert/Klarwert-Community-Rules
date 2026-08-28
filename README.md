# Klarwert Community Rules

Community-gepflegte Daten für [Klarwert](https://github.com/Klarwert/Klarwert) — ein lokales,
privates Haushaltsbuch ohne Cloud, ohne Login, ohne Server.

Dieses Repository enthält **zwei Arten von Daten**, die Klarwert-Nutzer per Klick in die App laden können:

| Daten | Ordner | Wofür? |
|---|---|---|
| Händler-Kategorisierung | [`merchants/`](merchants/) | "REWE" wird automatisch als "Lebensmittel" erkannt |
| Bank-Import-Profile | [`bank-profiles/`](bank-profiles/) | Klarwert erkennt automatisch, welche Spalte in deiner Bank-CSV-Datei was bedeutet |

## Was ist eine "Community Rule"?

Eine reine, deklarative Zuordnung — z. B. "der Text 'REWE MARKT GMBH' im Kontoauszug gehört zum
Händler REWE, Standardkategorie: Lebensmittel". **Keine echten Beträge, keine Kontodaten, keine
Namen realer Personen, kein Code, keine SQL-Befehle.**

## Datenschutz-Garantie

- Es wird **ausschließlich Struktur** geteilt: Händlername → Kategorie, oder CSV-Spaltenname → Bedeutung.
- **Niemals**: Kontostände, Beträge, Buchungsdaten, IBANs, Namen realer Personen, E-Mail-Adressen oder
  sonstige personenbezogene Daten. Ein automatischer Prüfschritt (`npm run validate`) lehnt Werte ab,
  die wie eine IBAN oder E-Mail-Adresse aussehen — verlasse dich darauf trotzdem nicht blind: reiche
  grundsätzlich nur frei erfundene Beispielwerte ein, niemals eine echte exportierte Zeile.
- Bank-Profile enthalten ausschließlich **frei erfundene Beispielzeilen**, nie eine echte CSV-Zeile aus
  deinem tatsächlichen Kontoauszug.

## Lizenz

Alle Daten in diesem Repository stehen unter [CC0 1.0 Universal](LICENSE) — du kannst sie ohne jede
Einschränkung verwenden, kopieren, verändern und weiterverbreiten, auch kommerziell, ohne Namensnennung.
Das ist bewusst die freizügigste verfügbare Lizenz, weil es sich um reine Fakten (Kategorisierungsregeln,
CSV-Formate) handelt, keine kreativen Werke.

**Durch das Einreichen eines Beitrags bestätigst du, dass:**
1. du der Lizenz zustimmst (deine Daten werden damit CC0-lizenziert veröffentlicht),
2. dein Beitrag **keine** personenbezogenen oder privaten Finanzdaten enthält (siehe oben).

## Wie trage ich bei?

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) — Schritt-für-Schritt-Anleitung, auch für Leute ohne
Programmiererfahrung.

## Wie funktioniert das technisch? (für Contributor mit technischem Interesse)

- Jeder Händler ist eine eigene Datei unter `merchants/<name>.json` (Schema: [`schema/merchant.schema.json`](schema/merchant.schema.json)).
  Eine Datei pro Händler bedeutet: zwei Beiträge für unterschiedliche Händler können sich nie
  gegenseitig blockieren, und ein Pull Request zeigt genau eine neue/geänderte Datei.
- `npm run validate` prüft jede Datei automatisch (Schema, gültige Kategorie, doppelte Aliase,
  gefährliche Regex-Muster, siehe [SECURITY.md](SECURITY.md)).
- `npm run build` erzeugt daraus `dist/haendler.json` und `dist/bankprofile.json` — genau die Dateien,
  die die Klarwert-App unter "Kategorien → Regel-Update prüfen" lädt.
- Ein Eintrag wird nie gelöscht, sondern bei Bedarf mit `"status": "deprecated"` markiert — so kann die
  App eine bereits übernommene, inzwischen zurückgezogene Zuordnung sauber deaktivieren, ohne dass
  eigene Anpassungen von Nutzern verloren gehen.
- **Kein automatisches Zusammenführen von Beiträgen.** Jeder Pull Request wird von einem Menschen
  gelesen und gemerged — bewusst, siehe [SECURITY.md](SECURITY.md) für die Begründung.

## Verwandte Repositories

- [Klarwert](https://github.com/Klarwert/Klarwert) — die App, die diese Daten konsumiert
- [klarwert.github.io](https://github.com/Klarwert/klarwert.github.io) — die Projekt-Website
