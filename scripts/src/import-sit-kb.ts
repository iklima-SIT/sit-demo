import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { normalizeKnowledgeRows } from "@workspace/sit-engine";

function selectCanonicalSheet(workbook: XLSX.WorkBook): string {
  const preferred = ["V10_Master_Knowledge_Graph", "Iklima"];
  return preferred.find(name => workbook.Sheets[name]) ?? workbook.SheetNames[0] ?? "";
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: pnpm import:sit-kb <path-to-xlsx>");
  process.exit(1);
}

const invocationDir = process.env.INIT_CWD ?? process.cwd();
const workbookPath = path.resolve(invocationDir, inputPath);
const workbook = XLSX.readFile(workbookPath);
const sheetName = selectCanonicalSheet(workbook);
if (!sheetName || !workbook.Sheets[sheetName]) {
  console.error("Knowledge import failed: workbook has no readable sheets.");
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false }) as unknown[][];
const result = normalizeKnowledgeRows({
  rows,
  sheetName,
  sourceWorkbook: path.basename(workbookPath),
});

const outDir = path.resolve(invocationDir, "artifacts/api-server/data/knowledge");
fs.mkdirSync(outDir, { recursive: true });

const version = result.bundle.metadata.version;
const bundlePath = path.join(outDir, `${version}.json`);
const reportPath = path.join(outDir, `${version}.report.json`);
const currentPath = path.join(outDir, "current.json");
const currentReportPath = path.join(outDir, "current.report.json");

if (result.report.invalidRows.length > 0) {
  fs.writeFileSync(reportPath, `${JSON.stringify(result.report, null, 2)}\n`);
  fs.writeFileSync(currentReportPath, `${JSON.stringify(result.report, null, 2)}\n`);
  console.error(`Knowledge import failed with ${result.report.invalidRows.length} invalid row(s).`);
  for (const row of result.report.invalidRows.slice(0, 10)) {
    console.error(`- row ${row.rowNumber}${row.id ? ` (${row.id})` : ""}: ${row.errors.join(", ")}`);
  }
  console.error(`Report written to ${reportPath}`);
  process.exit(1);
}

fs.writeFileSync(bundlePath, `${JSON.stringify(result.bundle, null, 2)}\n`);
fs.writeFileSync(reportPath, `${JSON.stringify(result.report, null, 2)}\n`);
fs.writeFileSync(currentPath, `${JSON.stringify(result.bundle, null, 2)}\n`);
fs.writeFileSync(currentReportPath, `${JSON.stringify(result.report, null, 2)}\n`);

console.log(`Imported ${result.bundle.cards.length} knowledge cards from ${sheetName}.`);
console.log(`Version: ${version}`);
console.log(`JSON: ${bundlePath}`);
console.log(`Report: ${reportPath}`);
