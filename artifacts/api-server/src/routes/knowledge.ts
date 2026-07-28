import path from "node:path";
import { Router, type IRouter, type Request, type Response } from "express";
import { knowledgeRepository } from "../repositories/knowledge-repository";
import { importKnowledgeWorkbookFromBase64, writeKnowledgeImportFiles } from "../services/knowledge-importer";

const router: IRouter = Router();
const KNOWLEDGE_DIR = path.resolve(
  process.cwd(),
  process.cwd().endsWith("api-server") ? "data/knowledge" : "artifacts/api-server/data/knowledge",
);

router.get("/knowledge/version", async (_req: Request, res: Response): Promise<void> => {
  res.json({
    version: await knowledgeRepository.getVersion(),
    metadata: await knowledgeRepository.getImportMetadata(),
  });
});

router.post("/knowledge/search", async (req: Request, res: Response): Promise<void> => {
  const query = String(req.body.query ?? "");
  if (!query.trim()) {
    res.status(400).json({ error: "query is required" });
    return;
  }
  const hits = await knowledgeRepository.search(query, {
    purpose: req.body.purpose ? String(req.body.purpose) : undefined,
    travelerType: req.body.travelerType ? String(req.body.travelerType) : undefined,
    limit: Number(req.body.limit) || 5,
  });
  res.json({
    version: await knowledgeRepository.getVersion(),
    importedAt: (await knowledgeRepository.getImportMetadata()).importedAt,
    hits: hits.map(hit => ({
      card: hit.card,
      score: hit.score,
    })),
  });
});

router.post("/knowledge/import", async (req: Request, res: Response): Promise<void> => {
  const fileName = String(req.body.fileName || "");
  const dataBase64 = String(req.body.dataBase64 || "");
  if (!fileName || !dataBase64) {
    res.status(400).json({ error: "fileName and dataBase64 are required" });
    return;
  }

  try {
    const result = importKnowledgeWorkbookFromBase64({ fileName, dataBase64 });
    const files = writeKnowledgeImportFiles(result, KNOWLEDGE_DIR);
    await knowledgeRepository.replace(result.bundle);
    res.json({
      metadata: result.bundle.metadata,
      report: result.report,
      files,
    });
  } catch (error) {
    res.status(422).json({
      error: error instanceof Error ? error.message : "Knowledge import failed",
    });
  }
});

export default router;
