import fs from "node:fs";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error("Usage: node scripts/build-mfds-reference.mjs input.jsonl output.ts");
}

const rows = fs.readFileSync(input, "utf8").trim().split(/\r?\n/).map(line => JSON.parse(line));
const result = rows.flatMap(row => {
  if (row.origin.includes("업체 제공")) return [];
  const basis = /^(\d+(?:\.\d+)?)(g|ml)$/i.exec(row.basis || "");
  const weight = /^(\d+(?:\.\d+)?)(g|ml)$/i.exec(row.weight || "");
  if (!basis || !weight || basis[2].toLowerCase() !== weight[2].toLowerCase()) return [];
  const basisAmount = Number(basis[1]);
  const servingAmount = Number(weight[1]);
  if (!basisAmount || !servingAmount || servingAmount > 1500 || row.kcal <= 0 || row.kcal > 900) return [];
  return [{
    code: row.code,
    name: row.name,
    kcalPerBasis: row.kcal,
    basisAmount,
    servingAmount,
    unit: basis[2].toLowerCase(),
    origin: row.origin,
    method: row.method
  }];
});

fs.writeFileSync(output,
  "// Derived from the MFDS food DB snapshot dated 2026-08-28.\nexport const foodReferences = [\n"
  + result.map(row => "  " + JSON.stringify(row)).join(",\n") + "\n];\n", "utf8");
console.log(`Saved ${result.length} sourced food references to ${output}`);
