#!/usr/bin/env node
// Baut aus merchants/*.json und bank-profiles/*.json die beiden Distributionsdateien, die die
// Klarwert-App per `fetch()` direkt von raw.githubusercontent.com lädt: dist/haendler.json,
// dist/bankprofile.json. Läuft NIEMALS, ohne dass runFullValidation() vorher fehlerfrei war -
// ein Build aus ungültigen Daten wäre schlimmer als gar kein Build.
//
// Warum dist/ committed wird (kein .gitignore): es gibt bewusst keinen Server, kein GitHub-Release-
// Upload, keine Pages-Pipeline - raw.githubusercontent.com kann nur Dateien ausliefern, die auf dem
// `main`-Branch tatsächlich committed sind. Der CI-Workflow baut deshalb bei jedem Push auf `main`
// (NIE bei PRs von Forks) dist/ neu und committed das Ergebnis zurück - das ist sicher, weil dieser
// Schritt ausschließlich bereits menschlich reviewte, gemergte Inhalte verarbeitet, keine
// ungeprüften PR-/Issue-Daten (siehe .github/workflows/ci.yml, Job "publish-dist").
//
// Determinismus: dieselbe Repo-Revision erzeugt IMMER byte-identische Distributionsdateien.
// Erreicht durch (a) alphabetische Sortierung nach canonical_name/name statt Dateisystem-
// Lesereihenfolge (die je nach OS/Dateisystem variieren kann), (b) `source_version` aus dem
// Git-Commit-SHA statt dem aktuellen Datum (ein erneuter Build derselben Revision zu einem
// späteren Zeitpunkt liefert exakt dieselbe Datei, nicht nur dieselben Inhalte mit anderem Datum).

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runFullValidation } from "./validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

// Schema-Version der Distributionsdateien selbst (nicht der Repo-Struktur) - erhöhen, wenn sich die
// Form von dist/haendler.json bzw. dist/bankprofile.json unvereinbar ändert (App muss das prüfen,
// siehe Klarwert/src/db/repositories/merchants.ts).
const SCHEMA_VERSION = 1;

function gitShortSha() {
  try {
    return execSync("git rev-parse --short=12 HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "dev"; // z. B. lokaler Testlauf ohne Commit - kein Fehlerfall, nur weniger präzise Versionsangabe.
  }
}

function buildMerchantRelease(merchantFiles) {
  const merchants = merchantFiles
    .map(({ data }) => ({
      canonical_name: data.canonical_name,
      display_name: data.display_name,
      default_category_template_key: data.default_category_template_key ?? null,
      status: data.status,
      aliases: data.aliases.map((a) => ({
        type: a.type,
        field: a.field ?? "counterparty",
        value: a.value,
      })),
    }))
    .sort((a, b) => (a.canonical_name < b.canonical_name ? -1 : a.canonical_name > b.canonical_name ? 1 : 0));

  return {
    schema_version: SCHEMA_VERSION,
    source_version: gitShortSha(),
    merchants,
  };
}

function buildBankProfileRelease(bankProfileFiles) {
  const profiles = bankProfileFiles
    .map(({ data }) => ({ ...data }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return {
    schema_version: SCHEMA_VERSION,
    source_version: gitShortSha(),
    profiles,
  };
}

const { errors, merchantFiles, bankProfileFiles } = runFullValidation();
if (errors.length > 0) {
  console.error(`\n❌ Build abgebrochen: ${errors.length} Validierungsfehler. Kein Distributionsartefakt aus ungültigen Daten.\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

mkdirSync(DIST, { recursive: true });

const merchantRelease = buildMerchantRelease(merchantFiles);
const bankProfileRelease = buildBankProfileRelease(bankProfileFiles);

// Stabile Einrückung/Zeilenumbrüche (JSON.stringify mit fixem Indent) statt einer Formatter-
// Bibliothek mit potenziell nicht-deterministischem Verhalten zwischen Node-Versionen.
writeFileSync(path.join(DIST, "haendler.json"), JSON.stringify(merchantRelease, null, 2) + "\n");
writeFileSync(path.join(DIST, "bankprofile.json"), JSON.stringify(bankProfileRelease, null, 2) + "\n");

console.log(
  `✅ Build erfolgreich: dist/haendler.json (${merchantRelease.merchants.length} Händler, ` +
    `davon ${merchantRelease.merchants.filter((m) => m.status === "deprecated").length} deprecated), ` +
    `dist/bankprofile.json (${bankProfileRelease.profiles.length} Profile). source_version=${merchantRelease.source_version}`,
);
