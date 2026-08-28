# Mitmachen bei Klarwert Community Rules

Danke, dass du mithelfen willst! Diese Anleitung setzt **keine** Programmiererfahrung voraus — nur
Grundkenntnisse in Git/GitHub (klonen, Datei bearbeiten, Pull Request erstellen).

## 1. Was ist eine Community Rule?

Eine einfache Zuordnung: *"Dieser Text im Kontoauszug gehört zu diesem Händler, und dieser Händler
gehört normalerweise in diese Kategorie."* Zum Beispiel: "REWE MARKT GMBH" → Händler "REWE" →
Kategorie "Lebensmittel und Getränke".

## 2. Was darf ich hinzufügen?

- Einen **neuen Händler**, den es noch nicht gibt (schau vorher in [`merchants/`](merchants/) nach).
- Eine **Korrektur** an einem bestehenden Händler (z. B. falsche Kategorie, fehlende Schreibweise).
- Ein **neues Bank-Import-Profil** für eine Bank, die Klarwert noch nicht automatisch erkennt.

## 3. Was darf ich NICHT hinzufügen?

- **Keine echten Kontodaten**: keine Beträge, keine Buchungsdaten, keine IBANs, keine Namen realer
  Personen, keine E-Mail-Adressen.
- **Keine echten CSV-Zeilen** aus deinem eigenen Kontoauszug — Bank-Profile brauchen nur *frei
  erfundene* Beispielzeilen mit derselben Spaltenstruktur.
- **Keinen Code, keine SQL-Befehle, kein HTML** — nur die in den Beispieldateien gezeigten,
  einfachen Textfelder.
- **Keine "cleveren" Regex-Muster**, die du nicht erklären kannst — sie werden automatisch geprüft
  und bei Verdacht auf gefährliche Muster abgelehnt (siehe [SECURITY.md](SECURITY.md)).

## 4. Wie erstelle ich einen neuen Händler?

1. Öffne einen bestehenden Ordner-Eintrag als Vorlage, z. B. [`merchants/rewe.json`](merchants/rewe.json).
2. Erstelle eine neue Datei `merchants/<name>.json` — `<name>` ist ein kurzer, eindeutiger Name nur mit
   Kleinbuchstaben, Ziffern und Unterstrichen (z. B. `edeka`, `deutsche_bahn`).
3. Fülle die Felder aus:

```json
{
  "canonical_name": "mein_haendler",
  "display_name": "Mein Händler",
  "default_category_template_key": "lebenshaltung.lebensmittel_getraenke",
  "status": "active",
  "aliases": [
    { "type": "name_exact", "value": "mein haendler" },
    { "type": "name_fuzzy", "value": "mein haendler filiale" }
  ]
}
```

Wichtig: `canonical_name` im Inhalt muss **exakt** dem Dateinamen entsprechen (ohne `.json`).

**Alias-Typen:**
- `name_exact` — muss exakt (nach Kleinschreibung) auf den Empfänger-Text passen.
- `name_fuzzy` — erlaubt kleine Abweichungen (Rechtsform, Filialnummer, o. Ä.).
- `regex` — nur für Fortgeschrittene, wird streng geprüft (siehe [SECURITY.md](SECURITY.md)); im
  Zweifel `name_fuzzy` verwenden.

## 5. Wie finde ich den richtigen `category_template_key`?

Öffne [`schema/category-keys.json`](schema/category-keys.json) — das ist die vollständige, exakte
Liste aller Kategorien, die die Klarwert-App kennt. **Verwende nur einen Key aus dieser Liste, rate
nie und übernimm keinen Key aus einer alten Vorlage oder einem anderen Projekt.** Findest du keine
passende Kategorie, setze `"default_category_template_key": null` und beschreibe im Pull Request,
warum keine Kategorie passt (z. B. bei Zahlungsdienstleistern wie PayPal, wo der eigentliche Händler
im Verwendungszweck steht, nicht im Empfängernamen).

## 6. Wie teste ich meine Änderung?

```bash
npm install   # einmalig
npm run validate   # prüft alle Dateien inkl. deiner neuen
npm test           # führt zusätzlich die Testsuite aus
```

`npm run validate` sagt dir genau, welche Zeile welcher Datei ein Problem hat. Ein grünes ✅ bedeutet:
deine Änderung ist strukturell korrekt und sicher genug für einen Pull Request.

## 7. Wie erstelle ich einen Pull Request?

1. Fork dieses Repository, klone deinen Fork.
2. Erstelle einen neuen Branch, z. B. `git checkout -b add-mein-haendler`.
3. Füge deine Datei hinzu, committe sie: `git add merchants/mein_haendler.json && git commit -m "feat: Händler Mein Händler hinzufügen"`.
4. Push und öffne auf GitHub einen Pull Request gegen `Klarwert/Klarwert-Community-Rules` (`main`).
5. Fülle die Checkliste im PR-Template aus.

Kein GitHub/Git-Erfahrung? Nutze stattdessen das [Issue-Formular](../../issues/new/choose) — ein
Mensch übernimmt dann die technische Umsetzung für dich.

## 8. Was passiert danach?

- Eine automatische Prüfung (GitHub Actions) läuft über deinen PR und kommentiert das Ergebnis.
- Ein Mensch (Maintainer) liest deinen Beitrag und die Begründung im PR.
- **Es gibt in dieser ersten Version kein automatisches Zusammenführen** — jeder Beitrag wird bewusst
  von einem Menschen geprüft und gemerged, egal wie viele Personen denselben Vorschlag machen.
- Nach dem Merge wird automatisch eine neue Distributionsdatei gebaut. Klarwert-Nutzer sehen deinen
  Beitrag beim nächsten "Regel-Update prüfen" in der App — mit einer Vorschau, bevor sie ihn übernehmen.

## Bank-Profile: zusätzliche Sorgfalt

Ein falsches Bank-Profil (vertauschte Spalten, falsches Dezimaltrennzeichen) kann echte Kontostände
verfälschen — deshalb werden Bank-Profile **immer manuell** geprüft, unabhängig davon, wie viele Leute
denselben Vorschlag machen. Achte besonders darauf, dass `column_map` exakt zu den `headers` passt und
deine `sample_rows` dieselbe Spaltenanzahl haben.
