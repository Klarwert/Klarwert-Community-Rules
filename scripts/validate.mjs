#!/usr/bin/env node
// Validiert alle Dateien unter merchants/ und bank-profiles/ gegen das jeweilige JSON-Schema plus
// zusätzliche, über reines JSON-Schema hinausgehende Prüfungen (Datei=canonical_name, gültige
// Kategorie-Keys, Cross-File-Duplikate, ReDoS-Heuristik, Längenlimits). Ziel: die Daten sind nach
// erfolgreicher Validierung tatsächlich vertrauenswürdig genug für einen automatisierten Build,
// nicht nur syntaktisch wohlgeformt.
//
// Exportiert alle Prüffunktionen einzeln, damit scripts/validate.test.mjs sie isoliert testen kann.
// Als CLI ausgeführt (`node scripts/validate.mjs`) validiert es das gesamte Repo und beendet sich
// mit Exit-Code 1, sobald mindestens ein Fehler gefunden wurde (für CI).

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv from "ajv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

export const MERCHANT_SCHEMA = JSON.parse(readFileSync(path.join(ROOT, "schema/merchant.schema.json"), "utf8"));
export const BANK_PROFILE_SCHEMA = JSON.parse(readFileSync(path.join(ROOT, "schema/bank-profile.schema.json"), "utf8"));
export const CATEGORY_KEYS = new Set(JSON.parse(readFileSync(path.join(ROOT, "schema/category-keys.json"), "utf8")).keys);

const ajv = new Ajv({ allErrors: true, strict: true });
const validateMerchantSchema = ajv.compile(MERCHANT_SCHEMA);
const validateBankProfileSchema = ajv.compile(BANK_PROFILE_SCHEMA);

/**
 * Konservative, rein statische ReDoS-Heuristik statt einer laufzeitbasierten Timeout-Prüfung.
 *
 * Warum keine Timeout-Prüfung: JavaScript kann eine einmal gestartete, synchrone `RegExp.test()`-
 * Ausführung nicht von außen unterbrechen (Single-Threaded, kein Preemption) - ein `setTimeout`/
 * `Promise.race` "Timeout" um einen Regex-Test herum würde den hängenden Aufruf NICHT stoppen,
 * sondern nur so tun, als sei geprüft worden (der Validierungsprozess selbst würde weiter hängen).
 * Das wäre exakt die "scheinbar sichere, aber unzuverlässige" Lösung, die hier bewusst vermieden
 * wird. Eine echte Unterbrechung bräuchte einen Worker-Thread/Kindprozess mit hartem `terminate()` -
 * für ein Daten-Repo mit überschaubarer Regel-Menge ist das ein unverhältnismäßiger Mehraufwand
 * gegenüber einer konservativen, deterministischen Heuristik, die im Zweifel eher zu viel als zu
 * wenig ablehnt (siehe Analyse-Phase: "keine komplizierte Sicherheitslösung, die selbst unsicher ist").
 *
 * Diese Heuristik ist bewusst KEIN vollständiger ReDoS-Beweis (algorithmisch nicht entscheidbar),
 * sondern ein Best-Effort-Filter gegen die bekanntesten, häufigsten Angriffsklassen:
 *   1. Verschachtelte Quantifizierer: (a+)+, (a*)*, (a+)*, (a*)+, (a{2,})+ ...
 *   2. Sehr große Wiederholungszähler in {n,m}-Angaben (auch ohne Verschachtelung teuer).
 *   3. Zu viele Quantifizierer insgesamt (Gesamtkomplexität begrenzen).
 */
export function checkRegexSafety(pattern) {
  if (pattern.length > 200) {
    return { safe: false, reason: "Regex-Pattern länger als 200 Zeichen." };
  }

  // 1. Verschachtelte Quantifizierer: eine Gruppe, die selbst einen Quantifizierer enthält, gefolgt
  // von einem weiteren Quantifizierer auf die Gruppe. Deckt keine beliebig tiefe Verschachtelung ab,
  // aber die überwältigende Mehrheit real vorkommender ReDoS-Patterns.
  const nestedQuantifier = /\([^()]*[+*][^()]*\)[+*]/;
  if (nestedQuantifier.test(pattern)) {
    return { safe: false, reason: "Verschachtelte Quantifizierer erkannt (z. B. \"(a+)+\") - klassisches ReDoS-Muster." };
  }

  // 2. Sehr große explizite Wiederholungszähler ({500,}, {10,1000}, ...).
  const largeRepeat = /\{(\d+)(,(\d+)?)?\}/g;
  let m;
  while ((m = largeRepeat.exec(pattern))) {
    const min = Number(m[1]);
    const max = m[3] !== undefined ? Number(m[3]) : min;
    if (min > 50 || max > 200) {
      return { safe: false, reason: `Unverhältnismäßig hoher Wiederholungszähler {${m[1]}${m[2] ?? ""}}.` };
    }
  }

  // 3. Gesamtkomplexität: mehr als 10 Quantifizierer in einem Pattern sind für eine simple
  // Namens-/Zweck-Erkennung nicht plausibel und erhöhen das Risiko unerwarteter Backtracking-Explosion
  // durch Kombination mehrerer für sich harmloser Quantifizierer.
  const quantifierCount = (pattern.match(/[+*]|\{\d+(,\d*)?\}/g) ?? []).length;
  if (quantifierCount > 10) {
    return { safe: false, reason: `Zu viele Quantifizierer (${quantifierCount}) - Pattern zu komplex für eine Alias-Regel.` };
  }

  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern, "i");
  } catch (e) {
    return { safe: false, reason: `Ungültige Regex-Syntax: ${e.message}` };
  }

  return { safe: true };
}

/** Feldnamen/Muster, die auf versehentlich eingefügte echte (personenbezogene/sensible) Daten hindeuten. */
const SENSITIVE_VALUE_PATTERNS = [
  { name: "IBAN", re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/ },
  { name: "E-Mail-Adresse", re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
  { name: "lange Ziffernfolge (Konto-/Kartennummer?)", re: /\d{10,}/ },
];

function checkNoSensitiveData(strings, filePath, errors) {
  for (const s of strings) {
    for (const { name, re } of SENSITIVE_VALUE_PATTERNS) {
      if (re.test(s)) {
        errors.push(`${filePath}: Wert "${s}" sieht aus wie ${name} - Community-Dateien dürfen niemals personenbezogene/sensible Daten enthalten.`);
      }
    }
  }
}

/** Validiert eine einzelne Merchant-Datei. Gibt eine Liste von Fehlermeldungen zurück (leer = gültig). */
export function validateMerchantFile(data, fileBaseName, filePath) {
  const errors = [];

  if (!validateMerchantSchema(data)) {
    for (const err of validateMerchantSchema.errors) {
      errors.push(`${filePath}: ${err.instancePath || "(root)"} ${err.message}`);
    }
    return errors; // Bei Schema-Fehlern lohnen sich Folgeprüfungen auf denselben Daten nicht.
  }

  if (data.canonical_name !== fileBaseName) {
    errors.push(`${filePath}: canonical_name ("${data.canonical_name}") muss exakt dem Dateinamen ("${fileBaseName}") entsprechen.`);
  }

  if (data.default_category_template_key && !CATEGORY_KEYS.has(data.default_category_template_key)) {
    errors.push(
      `${filePath}: default_category_template_key "${data.default_category_template_key}" ist kein gültiger Klarwert-Kategorie-Key ` +
        `(siehe schema/category-keys.json). Nicht raten oder aus einer alten Vorlage übernehmen - im Zweifel im PR nachfragen.`,
    );
  }

  for (const alias of data.aliases) {
    if (alias.type === "regex") {
      const check = checkRegexSafety(alias.value);
      if (!check.safe) {
        errors.push(`${filePath}: Alias-Regex "${alias.value}" abgelehnt: ${check.reason}`);
      }
    }
  }

  checkNoSensitiveData(
    [data.display_name, ...data.aliases.map((a) => a.value)],
    filePath,
    errors,
  );

  return errors;
}

/** Validiert eine einzelne Bank-Profil-Datei. */
export function validateBankProfileFile(data, fileBaseName, filePath) {
  const errors = [];

  if (!validateBankProfileSchema(data)) {
    for (const err of validateBankProfileSchema.errors) {
      errors.push(`${filePath}: ${err.instancePath || "(root)"} ${err.message}`);
    }
    return errors;
  }

  const expectedSlug = slugify(data.name);
  if (fileBaseName !== expectedSlug) {
    errors.push(`${filePath}: Dateiname ("${fileBaseName}") sollte dem slugifizierten "name" ("${expectedSlug}") entsprechen.`);
  }

  const mappedHeaders = new Set(Object.values(data.column_map));
  for (const h of mappedHeaders) {
    if (!data.headers.includes(h)) {
      errors.push(`${filePath}: column_map referenziert Header "${h}", der nicht in "headers" vorkommt.`);
    }
  }
  for (const row of data.sample_rows) {
    if (row.length !== data.headers.length) {
      errors.push(`${filePath}: sample_row hat ${row.length} Spalten, "headers" hat ${data.headers.length} - müssen übereinstimmen.`);
    }
  }

  // Bewusst KEIN checkNoSensitiveData() auf sample_rows: Bank-Profile brauchen laut Schema/Konzept
  // absichtlich strukturell echt aussehende, aber frei erfundene Beispielwerte (inkl. IBAN-förmiger
  // Strings), um die Spaltenzuordnung zu demonstrieren. Eine automatisierte Prüfung kann "sieht aus
  // wie eine IBAN" nicht von "ist zufällig eine erfundene, aber gültig aussehende IBAN" unterscheiden -
  // das Prinzip "immer synthetische Beispieldaten" ist hier ein Vertrauens-/Review-Grundsatz
  // (dokumentiert in CONTRIBUTING.md, geprüft im PR durch Menschen), keine automatisierbare Regel.

  return errors;
}

export function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function loadJsonFiles(dir) {
  if (!existsDir(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const filePath = path.relative(ROOT, path.join(dir, f));
      const baseName = f.slice(0, -".json".length);
      let data;
      try {
        data = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
      } catch (e) {
        return { filePath, baseName, data: null, parseError: e.message };
      }
      return { filePath, baseName, data, parseError: null };
    });
}

function existsDir(dir) {
  try {
    return readdirSync(dir) !== undefined;
  } catch {
    return false;
  }
}

/** Cross-File-Prüfung: zwei verschiedene Händler dürfen nicht denselben eindeutigen Alias-Wert beanspruchen. */
export function checkCrossFileAliasDuplicates(merchantFiles) {
  const errors = [];
  const seen = new Map(); // "type|field|value" -> canonical_name
  for (const { data, filePath } of merchantFiles) {
    if (!data) continue;
    for (const alias of data.aliases ?? []) {
      if (alias.type !== "name_exact") continue; // fuzzy/regex dürfen sich bewusst überschneiden (Priorität regelt die App)
      const key = `${alias.type}|${alias.field ?? "counterparty"}|${alias.value.trim().toLowerCase()}`;
      const existing = seen.get(key);
      if (existing && existing.canonical_name !== data.canonical_name) {
        errors.push(
          `${filePath}: name_exact-Alias "${alias.value}" ist bereits von "${existing.canonical_name}" (${existing.filePath}) belegt - ` +
            `zwei Händler dürfen keinen identischen exakten Alias beanspruchen.`,
        );
      } else {
        seen.set(key, { canonical_name: data.canonical_name, filePath });
      }
    }
  }
  return errors;
}

export function checkDuplicateCanonicalNames(merchantFiles) {
  const errors = [];
  const seen = new Map();
  for (const { data, filePath } of merchantFiles) {
    if (!data) continue;
    const existing = seen.get(data.canonical_name);
    if (existing) {
      errors.push(`${filePath}: canonical_name "${data.canonical_name}" bereits verwendet in ${existing} (Dateiname sollte das ohnehin verhindern - Datei umbenennen).`);
    } else {
      seen.set(data.canonical_name, filePath);
    }
  }
  return errors;
}

export function runFullValidation() {
  const errors = [];
  const merchantFiles = loadJsonFiles(path.join(ROOT, "merchants"));
  const bankProfileFiles = loadJsonFiles(path.join(ROOT, "bank-profiles"));

  for (const f of merchantFiles) {
    if (f.parseError) {
      errors.push(`${f.filePath}: ungültiges JSON (${f.parseError})`);
      continue;
    }
    errors.push(...validateMerchantFile(f.data, f.baseName, f.filePath));
  }
  for (const f of bankProfileFiles) {
    if (f.parseError) {
      errors.push(`${f.filePath}: ungültiges JSON (${f.parseError})`);
      continue;
    }
    errors.push(...validateBankProfileFile(f.data, f.baseName, f.filePath));
  }

  errors.push(...checkCrossFileAliasDuplicates(merchantFiles));
  errors.push(...checkDuplicateCanonicalNames(merchantFiles));

  return { errors, merchantFiles, bankProfileFiles };
}

// CLI-Einstieg (nur wenn direkt ausgeführt, nicht beim Import aus validate.test.mjs).
if (import.meta.url === `file://${process.argv[1]}`) {
  const { errors, merchantFiles, bankProfileFiles } = runFullValidation();
  if (errors.length > 0) {
    console.error(`\n❌ ${errors.length} Validierungsfehler:\n`);
    for (const e of errors) console.error(`  - ${e}`);
    console.error("");
    process.exit(1);
  }
  console.log(`✅ ${merchantFiles.length} Händler, ${bankProfileFiles.length} Bank-Profile - alle gültig.`);
}
