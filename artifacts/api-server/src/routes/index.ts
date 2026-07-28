import { Router, type IRouter } from "express";
import healthRouter from "./health";
import whatsappRouter from "./whatsapp";
import eventsRouter from "./events";
import testExaRouter from "./test-exa";
import conversationRouter from "./conversation";
import knowledgeRouter from "./knowledge";

const router: IRouter = Router();

router.use(healthRouter);

// Twilio WhatsApp webhook — POST /api/whatsapp
router.use(whatsappRouter);

// Live event search — POST /api/events/search
router.use(eventsRouter);

// Exa diagnostic — GET /api/test-exa
router.use(testExaRouter);

// Canonical conversation/session endpoints
router.use(conversationRouter);

// Server-side SIT knowledge endpoints
router.use(knowledgeRouter);

export default router;
