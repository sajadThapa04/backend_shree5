// webhook.routes.js
import express from "express";
import {handleStripeWebhookController} from "../controllers/payment.controller.js";
import {handleRestaurantStripeWebhookController} from "../controllers/restaurantPayment.controller.js";
const router = express.Router();

// Apply express.raw() middleware ONLY to the webhook route
router.route("/").post(express.raw({type: "application/json"}), // Raw body middleware
    handleStripeWebhookController);
router.route("/restaurant").post(express.raw({type: "application/json"}), // Raw body middleware
    handleRestaurantStripeWebhookController);

export default router;