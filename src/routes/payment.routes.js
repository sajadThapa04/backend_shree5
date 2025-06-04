import Router from "express";
import {
  createUserPayment,
  createGuestPayment,
  updatePaymentStatus,
  getUserPayments,
  getPaymentById,
  confirmUserPayment,
  confirmGuestPayment,
  handleStripeWebhookController
} from "../controllers/payment.controller.js";
import {verifyJwt} from "../middlewares/auth.middlewares.js";
import {verifyGuestPayment} from "../middlewares/guestPayment.middlewares.js";

const router = Router();

// Authenticated user payment routes
router.post("/user", verifyJwt, createUserPayment);
router.get("/user", verifyJwt, getUserPayments);
router.get("/user/:id", verifyJwt, getPaymentById);

// Guest payment routes
router.post("/guest", verifyGuestPayment, createGuestPayment);
router.post("/guest/confirm", confirmGuestPayment); // No auth for guests


// Shared routes
router.put("/:id/status", verifyJwt, updatePaymentStatus);
router.post("/users/confirm", verifyJwt, confirmUserPayment);

// Webhook (no auth)
router.post("/webhook", handleStripeWebhookController);

export default router;