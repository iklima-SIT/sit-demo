import { Router, type IRouter } from "express";
import healthRouter from "./health";
import whatsappRouter from "./whatsapp";

const router: IRouter = Router();

router.use(healthRouter);

// Twilio WhatsApp webhook — POST /api/whatsapp
router.use(whatsappRouter);

export default router;
