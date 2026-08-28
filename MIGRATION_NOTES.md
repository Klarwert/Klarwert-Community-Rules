# Migrationsnotiz: Übernahme der Seed-Daten aus `Klarwert/community-repo-template`

Diese Datei dokumentiert, wie die 15 ursprünglich in `Klarwert/community-repo-template/data/merchants.json`
vorbereiteten Händler in das `merchants/*.json`-Modell dieses Repos übernommen wurden — und warum dabei
**keiner der ursprünglichen `template_key`-Werte unverändert übernommen werden konnte**.

## Befund

Die Vorlage verwendete Kategorie-Keys mit Bindestrichen (z. B. `lebenshaltung.lebensmittel-und-getraenke`,
`freizeit.shopping`, `transport.tanken`, `wohnen.telekommunikation`). Die tatsächliche, aktuelle
`TEMPLATE_CATEGORIES`-Liste in `Klarwert/src/db/repositories/categories.ts` verwendet durchgängig
Unterstriche statt Bindestriche und andere Top-Level-Namen (`mobilitaet` statt `transport`,
`shopping_unterhaltung`/`lebenshaltung` statt `freizeit`). **Keiner der ursprünglichen Keys existiert im
aktuellen Schema.** `applyMerchantDataRelease()` in der App würde für jeden dieser Keys `null` zurückbekommen
und den Händler ohne Kategorie anlegen — lautlos, ohne Fehlermeldung.

## Korrigierte Zuordnung

| Händler | Alter (ungültiger) Key | Neuer, verifizierter Key | Begründung |
|---|---|---|---|
| REWE, EDEKA, ALDI, Lidl | `lebenshaltung.lebensmittel-und-getraenke` | `lebenshaltung.lebensmittel_getraenke` | Direkte Entsprechung, nur Schreibweise korrigiert. |
| dm, Rossmann | `lebenshaltung.drogerie-und-apotheke` | `lebenshaltung.drogerie` | Es gibt keine separate "Apotheke"-Kategorie; dm/Rossmann sind Drogerien, nicht Apotheken. |
| Amazon | `freizeit.shopping` | `shopping_unterhaltung` (Top-Level) | Kein `freizeit`-Top-Level vorhanden; Amazon ist zu generisch für eine spezifische Unterkategorie, daher bewusst die allgemeine Shopping-Kategorie statt einer falschen Vermutung. |
| Netflix, Spotify | `freizeit.tv-video-musik` | `shopping_unterhaltung.tv_video_musik` | Direkte Entsprechung unter dem korrekten Top-Level. |
| Deutsche Bahn | `transport.oeffentlicher-nahverkehr` | `mobilitaet.taxi_oepnv_sharing` | Kein `transport`-Top-Level; ÖPNV/Bahn fällt unter die Sammelkategorie für Taxi/ÖPNV/Sharing. |
| Shell, Aral | `transport.tanken` | `mobilitaet.tanken` | Direkte Entsprechung unter dem korrekten Top-Level. |
| Telekom, Vodafone | `wohnen.telekommunikation` | `lebenshaltung.festnetz_internet` | Keine `wohnen.telekommunikation`-Kategorie vorhanden. Beide Anbieter sind primär als Festnetz-/Internet-Provider historisch verankert; Mobilfunk (`lebenshaltung.handy`) wäre die Alternative — Nutzer können lokal überschreiben (`is_modified`). |
| PayPal, Klarna | `null` | `null` (unverändert) | Zahlungsdienstleister ohne eigene Sachkategorie — bewusst unkategorisiert, der eigentliche Händler steckt im Verwendungszweck. |

## Konsequenz für den Contributor-Workflow

`scripts/validate.mjs` prüft jeden `default_category_template_key` gegen `schema/category-keys.json` —
ein neuer Beitrag mit einem erfundenen oder veralteten Key wird jetzt **hart abgelehnt**, statt lautlos in der
App ins Leere zu laufen.
