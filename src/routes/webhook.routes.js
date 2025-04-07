// webhook.routes.js
import express from "express";
import {handleStripeWebhookController} from "../controllers/payment.controller.js";

const router = express.Router();

// Apply express.raw() middleware ONLY to the webhook route
router.route("/").post( express.raw({type: "application/json"}), // Raw body middleware
    handleStripeWebhookController);

export default router;