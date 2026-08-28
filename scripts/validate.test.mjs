import { describe, it, expect } from "vitest";
import {
  checkRegexSafety,
  validateMerchantFile,
  validateBankProfileFile,
  checkCrossFileAliasDuplicates,
  checkDuplicateCanonicalNames,
  runFullValidation,
  slugify,
} from "./validate.mjs";

function validMerchant(overrides = {}) {
  return {
    canonical_name: "testmerchant",
    display_name: "Test Merchant",
    default_category_template_key: "lebenshaltung.lebensmittel_getraenke",
    status: "active",
    aliases: [{ type: "name_exact", value: "testmerchant" }],
    ...overrides,
  };
}

describe("checkRegexSafety (ReDoS-Heuristik)", () => {
  it("akzeptiert einfache, ungefährliche Patterns", () => {
    expect(checkRegexSafety("netflix").safe).toBe(true);
    expect(checkRegexSafety("amazon\\.de").safe).toBe(true);
    expect(checkRegexSafety("(einkauf bei|shop)\\s?netflix").safe).toBe(true);
  });

  it("lehnt klassische verschachtelte Quantifizierer ab (ReDoS-Klasse 1)", () => {
    expect(checkRegexSafety("(a+)+$").safe).toBe(false);
    expect(checkRegexSafety("(a*)*b").safe).toBe(false);
    expect(checkRegexSafety("(a+)*").safe).toBe(false);
    expect(checkRegexSafety("([a-zA-Z]+)*$").safe).toBe(false);
  });

  it("lehnt unverhältnismäßig hohe Wiederholungszähler ab (ReDoS-Klasse 2)", () => {
    expect(checkRegexSafety("a{1000,}").safe).toBe(false);
    expect(checkRegexSafety("a{5,500}").safe).toBe(false);
    expect(checkRegexSafety("a{1,20}").safe).toBe(true);
  });

  it("lehnt Patterns mit zu vielen Quantifizierern insgesamt ab (Gesamtkomplexität)", () => {
    const tooComplex = "a+b+c+d+e+f+g+h+i+j+k+l+";
    expect(checkRegexSafety(tooComplex).safe).toBe(false);
  });

  it("lehnt ungültige Regex-Syntax ab", () => {
    expect(checkRegexSafety("(unclosed").safe).toBe(false);
  });

  it("lehnt Patterns über 200 Zeichen ab", () => {
    expect(checkRegexSafety("a".repeat(201)).safe).toBe(false);
  });
});

describe("validateMerchantFile", () => {
  it("akzeptiert einen gültigen Community-Merchant", () => {
    expect(validateMerchantFile(validMerchant(), "testmerchant", "merchants/testmerchant.json")).toEqual([]);
  });

  it("lehnt einen ungültigen category_template_key ab", () => {
    const errors = validateMerchantFile(
      validMerchant({ default_category_template_key: "freizeit.shopping" }),
      "testmerchant",
      "merchants/testmerchant.json",
    );
    expect(errors.some((e) => e.includes("kein gültiger Klarwert-Kategorie-Key"))).toBe(true);
  });

  it("erlaubt default_category_template_key: null (z. B. Zahlungsdienstleister)", () => {
    expect(validateMerchantFile(validMerchant({ default_category_template_key: null }), "testmerchant", "x")).toEqual([]);
  });

  it("lehnt einen ungültigen canonical_name ab (Dateiname stimmt nicht überein)", () => {
    const errors = validateMerchantFile(validMerchant(), "andererdateiname", "merchants/andererdateiname.json");
    expect(errors.some((e) => e.includes("muss exakt dem Dateinamen"))).toBe(true);
  });

  it("lehnt canonical_name mit ungültigen Zeichen ab (Schema-Pattern)", () => {
    const errors = validateMerchantFile(validMerchant({ canonical_name: "Test Merchant!" }), "Test Merchant!", "x");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("lehnt eine gefährliche Regex in einem Alias ab", () => {
    const errors = validateMerchantFile(
      validMerchant({ aliases: [{ type: "regex", value: "(a+)+$" }] }),
      "testmerchant",
      "merchants/testmerchant.json",
    );
    expect(errors.some((e) => e.includes("abgelehnt"))).toBe(true);
  });

  it("lehnt einen ungültigen Alias-Typ ab (Schema-Enum)", () => {
    const errors = validateMerchantFile(
      validMerchant({ aliases: [{ type: "sql_injection", value: "'; DROP TABLE merchants; --" }] }),
      "testmerchant",
      "x",
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("lehnt zusätzliche, im Schema nicht vorgesehene Felder ab", () => {
    const errors = validateMerchantFile(
      validMerchant({ notes: "irgendwas", raw_sql: "select * from transactions" }),
      "testmerchant",
      "x",
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("lehnt einen ungültigen status-Wert ab", () => {
    const errors = validateMerchantFile(validMerchant({ status: "super-active" }), "testmerchant", "x");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("akzeptiert status: deprecated", () => {
    expect(validateMerchantFile(validMerchant({ status: "deprecated" }), "testmerchant", "x")).toEqual([]);
  });

  it("lehnt personenbezogene Daten im display_name/Alias ab (IBAN/E-Mail-Heuristik)", () => {
    const ibanErrors = validateMerchantFile(validMerchant({ display_name: "DE89370400440532013000" }), "testmerchant", "x");
    expect(ibanErrors.some((e) => e.includes("IBAN"))).toBe(true);

    const emailErrors = validateMerchantFile(
      validMerchant({ aliases: [{ type: "name_exact", value: "kontakt@beispiel.de" }] }),
      "testmerchant",
      "x",
    );
    expect(emailErrors.some((e) => e.includes("E-Mail"))).toBe(true);
  });

  it("erzwingt Längenlimits für display_name und Alias-Werte", () => {
    const errors = validateMerchantFile(validMerchant({ display_name: "x".repeat(200) }), "testmerchant", "x");
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("validateBankProfileFile", () => {
  function validProfile(overrides = {}) {
    return {
      name: "Testbank",
      country: "DE",
      status: "active",
      delimiter: ";",
      encoding: "utf-8",
      date_format: "dd.MM.yyyy",
      decimal_format: "de",
      headers: ["Datum", "Betrag", "Empfaenger"],
      column_map: { date: "Datum", amount: "Betrag", counterparty: "Empfaenger" },
      sample_rows: [["01.01.2026", "-10,00", "Testladen"]],
      ...overrides,
    };
  }

  it("akzeptiert ein gültiges Bank-Profil", () => {
    expect(validateBankProfileFile(validProfile(), "testbank", "bank-profiles/testbank.json")).toEqual([]);
  });

  it("lehnt einen inkonsistenten column_map-Verweis ab (Header existiert nicht)", () => {
    const errors = validateBankProfileFile(
      validProfile({ column_map: { date: "Datum", amount: "Betrag", counterparty: "Existiert Nicht" } }),
      "testbank",
      "x",
    );
    expect(errors.some((e) => e.includes("referenziert Header"))).toBe(true);
  });

  it("lehnt eine sample_row mit falscher Spaltenanzahl ab", () => {
    const errors = validateBankProfileFile(validProfile({ sample_rows: [["01.01.2026", "-10,00"]] }), "testbank", "x");
    expect(errors.some((e) => e.includes("Spalten"))).toBe(true);
  });

  it("erlaubt IBAN-förmige Werte in sample_rows (synthetische Beispieldaten sind Teil des Formats)", () => {
    const errors = validateBankProfileFile(
      validProfile({ sample_rows: [["01.01.2026", "-10,00", "DE89370400440532013000"]] }),
      "testbank",
      "x",
    );
    expect(errors).toEqual([]);
  });

  it("lehnt ein ungültiges delimiter ab (Enum)", () => {
    const errors = validateBankProfileFile(validProfile({ delimiter: "|" }), "testbank", "x");
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("Cross-File-Prüfungen", () => {
  it("erkennt doppelte name_exact-Aliase über zwei Händler hinweg", () => {
    const files = [
      { data: validMerchant({ canonical_name: "a" }), filePath: "merchants/a.json" },
      { data: validMerchant({ canonical_name: "b", aliases: [{ type: "name_exact", value: "testmerchant" }] }), filePath: "merchants/b.json" },
    ];
    const errors = checkCrossFileAliasDuplicates(files);
    expect(errors.length).toBe(1);
  });

  it("erlaubt überlappende name_fuzzy/regex-Aliase (keine harte Eindeutigkeit nötig)", () => {
    const files = [
      { data: validMerchant({ canonical_name: "a", aliases: [{ type: "name_fuzzy", value: "shop" }] }), filePath: "a" },
      { data: validMerchant({ canonical_name: "b", aliases: [{ type: "name_fuzzy", value: "shop" }] }), filePath: "b" },
    ];
    expect(checkCrossFileAliasDuplicates(files)).toEqual([]);
  });

  it("erkennt doppelte canonical_name-Werte", () => {
    const files = [
      { data: validMerchant({ canonical_name: "dupe" }), filePath: "a.json" },
      { data: validMerchant({ canonical_name: "dupe" }), filePath: "b.json" },
    ];
    expect(checkDuplicateCanonicalNames(files).length).toBe(1);
  });
});

describe("slugify", () => {
  it("erzeugt einen dateinamentauglichen Slug aus einem Anzeigenamen", () => {
    expect(slugify("Volksbank/GLS (VR)")).toBe("volksbank-gls-vr");
    expect(slugify("Sparkasse (CSV-CAMT)")).toBe("sparkasse-csv-camt");
  });
});

describe("runFullValidation gegen die tatsächlichen migrierten Daten im Repo", () => {
  it("findet keine Fehler in merchants/ und bank-profiles/", () => {
    const { errors } = runFullValidation();
    expect(errors).toEqual([]);
  });
});
