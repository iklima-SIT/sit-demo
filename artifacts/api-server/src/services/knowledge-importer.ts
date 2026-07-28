import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import {
  normalizeKnowledgeRows,
  type KnowledgeImportBundle,
  type KnowledgeImportReport,
} from "@workspace/sit-engine";

export interface WorkbookImportResult {
  bundle: KnowledgeImportBundle;
  report: KnowledgeImportReport;
}

function selectCanonicalSheet(workbook: XLSX.WorkBook): string {
  const preferred = ["V10_Master_Knowledge_Graph", "Iklima"];
  return preferred.find(name => workbook.Sheets[name]) ?? workbook.SheetNames[0] ?? "";
}

export function importKnowledgeWorkbook(filePath: string, options: { version?: string; importedAt?: string } = {}): WorkbookImportResult {
  const workbook = XLSX.readFile(filePath);
  const sheetName = selectCanonicalSheet(workbook);
  if (!sheetName) {
    throw new Error("Workbook has no sheets.");
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Canonical sheet not found: ${sheetName}`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];
  const result = normalizeKnowledgeRows({
    rows,
    sheetName,
    sourceWorkbook: path.basename(filePath),
    version: options.version,
    importedAt: options.importedAt,
  });

  if (result.report.invalidRows.length > 0) {
    const preview = result.report.invalidRows
      .slice(0, 5)
      .map(row => `row ${row.rowNumber}: ${row.errors.join(", ")}`)
      .join("; ");
    throw new Error(`Knowledge import failed with ${result.report.invalidRows.length} invalid row(s): ${preview}`);
  }

  return result;
}

export function writeKnowledgeImportFiles(
  result: WorkbookImportResult,
  outDir: string,
): { bundlePath: string; reportPath: string; currentPath: string; currentReportPath: string } {
  fs.mkdirSync(outDir, { recursive: true });

  const version = result.bundle.metadata.version;
  const bundlePath = path.join(outDir, `${version}.json`);
  const reportPath = path.join(outDir, `${version}.report.json`);
  const currentPath = path.join(outDir, "current.json");
  const currentReportPath = path.join(outDir, "current.report.json");

  fs.writeFileSync(bundlePath, `${JSON.stringify(result.bundle, null, 2)}\n`);
  fs.writeFileSync(reportPath, `${JSON.stringify(result.report, null, 2)}\n`);
  fs.writeFileSync(currentPath, `${JSON.stringify(result.bundle, null, 2)}\n`);
  fs.writeFileSync(currentReportPath, `${JSON.stringify(result.report, null, 2)}\n`);

  return { bundlePath, reportPath, currentPath, currentReportPath };
}

export function importKnowledgeWorkbookFromBase64(input: {
  fileName: string;
  dataBase64: string;
  tempDir?: string;
}): WorkbookImportResult {
  const tempDir = input.tempDir ?? "/tmp";
  const safeName = path.basename(input.fileName || "sit-kb.xlsx");
  const tempPath = path.join(tempDir, `${Date.now()}-${safeName}`);
  fs.writeFileSync(tempPath, Buffer.from(input.dataBase64, "base64"));
  try {
    return importKnowledgeWorkbook(tempPath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}
