import * as XLSX from "xlsx";
import type { KBCard } from "@workspace/sit-engine";
import { EMBEDDED_KB } from "./kb-data";
export type { KBCard } from "@workspace/sit-engine";
export { extractKBInsight, searchKB, searchKBWithScore } from "@workspace/sit-engine";

// ─── Parse an uploaded xlsx file into KBCard[] ────────────────────────────────

export function parseXlsxToCards(file: File): Promise<KBCard[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });

        const cards: KBCard[] = [];

        // Try Iklima sheet first
        const iklimaSheet = wb.Sheets["Iklima"];
        if (iklimaSheet) {
          const raw = XLSX.utils.sheet_to_json(iklimaSheet, { header: 1 }) as unknown[][];
          const headerRow = raw.findIndex(
            r => Array.isArray(r) && r.includes("Card ID") && r.includes("Topic")
          );
          if (headerRow >= 0) {
            const headers = raw[headerRow] as string[];
            for (let i = headerRow + 1; i < raw.length; i++) {
              const r = raw[i] as (string | number | null)[];
              if (!r || !r[0]) continue;
              const get = (key: string) => String(r[headers.indexOf(key)] ?? "");
              cards.push({
                id: get("Card ID"),
                category: get("Category"),
                topic: get("Topic"),
                description: get("Description"),
                localInsight: get("Local Insight"),
                travelerType: get("Traveler Type"),
                bestFor: get("Best For"),
                notIdealFor: get("Not Ideal For"),
                aiRule: get("AI Rule"),
                localSecret: get("Local Secret"),
                touristMyth: get("Tourist Myth"),
                priority: Number(get("Priority")) || 5,
                confidence: get("Confidence"),
                source: "upload-iklima",
              });
            }
          }
        }

        // Try V10_Master_Knowledge_Graph sheet
        const v10Sheet = wb.Sheets["V10_Master_Knowledge_Graph"];
        if (v10Sheet) {
          const raw = XLSX.utils.sheet_to_json(v10Sheet, { header: 1 }) as unknown[][];
          const headerRow = raw.findIndex(
            r => Array.isArray(r) && r.includes("Card ID") && r.includes("Myth")
          );
          if (headerRow >= 0) {
            const headers = raw[headerRow] as string[];
            for (let i = headerRow + 1; i < raw.length; i++) {
              const r = raw[i] as (string | number | null)[];
              if (!r || !r[0]) continue;
              const get = (key: string) => String(r[headers.indexOf(key)] ?? "");
              cards.push({
                id: get("Card ID"),
                category: get("Category"),
                topic: get("Topic"),
                description: get("Myth") ? `Myth: ${get("Myth")} | Reality: ${get("Reality")}` : "",
                localInsight: get("Deep Local Insight"),
                travelerType: get("Traveler Type"),
                bestFor: get("Recommended For"),
                notIdealFor: get("Not Recommended For"),
                aiRule: get("AI Recommendation Logic"),
                localSecret: "",
                touristMyth: get("Myth"),
                priority: Number(get("Priority Score V10")) || 5,
                confidence: get("Confidence"),
                source: "upload-v10",
              });
            }
          }
        }

        // Fallback: try any sheet with a "Topic" column
        if (cards.length === 0) {
          for (const sheetName of wb.SheetNames) {
            const ws = wb.Sheets[sheetName];
            const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
            const headerRow = raw.findIndex(
              r => Array.isArray(r) && (r.includes("Topic") || r.includes("Description"))
            );
            if (headerRow < 0) continue;
            const headers = raw[headerRow] as string[];
            for (let i = headerRow + 1; i < raw.length; i++) {
              const r = raw[i] as (string | number | null)[];
              if (!r || !r[0]) continue;
              const get = (key: string) => String(r[headers.indexOf(key)] ?? "");
              cards.push({
                id: get("Card ID") || String(i),
                category: get("Category"),
                topic: get("Topic"),
                description: get("Description"),
                localInsight: get("Local Insight") || get("Deep Local Insight"),
                travelerType: get("Traveler Type"),
                bestFor: get("Best For") || get("Recommended For"),
                notIdealFor: get("Not Ideal For") || get("Not Recommended For"),
                aiRule: get("AI Rule") || get("AI Recommendation Logic"),
                localSecret: get("Local Secret"),
                touristMyth: get("Tourist Myth") || get("Myth"),
                priority: Number(get("Priority") || get("Priority Score V10")) || 5,
                confidence: get("Confidence"),
                source: `upload-${sheetName}`,
              });
            }
            if (cards.length > 0) break;
          }
        }

        resolve(cards);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── Default embedded KB ──────────────────────────────────────────────────────

export { EMBEDDED_KB };
