import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BUILD_SCRIPT = path.join(__dirname, "build.mjs");

function runBuild() {
  execFileSync(process.execPath, [BUILD_SCRIPT], { cwd: ROOT });
  return {
    haendler: readFileSync(path.join(ROOT, "dist/haendler.json"), "utf8"),
    bankprofile: readFileSync(path.join(ROOT, "dist/bankprofile.json"), "utf8"),
  };
}

describe("Build-Determinismus", () => {
  it("zwei aufeinanderfolgende Builds derselben Revision erzeugen byte-identische Distributionsdateien", () => {
    const first = runBuild();
    const second = runBuild();
    expect(second.haendler).toBe(first.haendler);
    expect(second.bankprofile).toBe(first.bankprofile);
  });

  it("dist/haendler.json ist alphabetisch nach canonical_name sortiert (unabhängig von Dateisystem-Lesereihenfolge)", () => {
    const { merchants } = JSON.parse(readFileSync(path.join(ROOT, "dist/haendler.json"), "utf8"));
    const names = merchants.map((m) => m.canonical_name);
    expect(names).toEqual([...names].sort());
  });

  it("dist/bankprofile.json ist alphabetisch nach name sortiert", () => {
    const { profiles } = JSON.parse(readFileSync(path.join(ROOT, "dist/bankprofile.json"), "utf8"));
    const names = profiles.map((p) => p.name);
    expect(names).toEqual([...names].sort());
  });

  it("enthält schema_version und einen nicht-leeren source_version-Wert", () => {
    const merchantRelease = JSON.parse(readFileSync(path.join(ROOT, "dist/haendler.json"), "utf8"));
    expect(merchantRelease.schema_version).toBe(1);
    expect(typeof merchantRelease.source_version).toBe("string");
    expect(merchantRelease.source_version.length).toBeGreaterThan(0);
  });
});
