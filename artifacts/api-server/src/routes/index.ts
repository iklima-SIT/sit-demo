import { Router, type IRouter } from "express";
import healthRouter from "./health";
import whatsappRouter from "./whatsapp";
import eventsRouter from "./events";

const router: IRouter = Router();

router.use(healthRouter);

// Twilio WhatsApp webhook — POST /api/whatsapp
router.use(whatsappRouter);

// Live event search — POST /api/events/search
router.use(eventsRouter);

export default router;
