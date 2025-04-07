import Router from "express";
import {
  createPayment, updatePaymentStatus, getUserPayments, getPaymentById, confirmPayment // Import the confirmPayment controller
} from "../controllers/payment.controller.js";
import {verifyJwt} from "../middlewares/auth.middlewares.js"; // Import JWT verification middleware

const router = Router();

// Protected routes (require JWT authentication)
router.route("/").post(verifyJwt, createPayment); // Create a new payment
router.route("/:id/status").put(verifyJwt, updatePaymentStatus); // Update payment status
router.route("/user").get(verifyJwt, getUserPayments); // Fetch all payments for a specific user
router.route("/:id").get(verifyJwt, getPaymentById); // Fetch payment details by ID
router.route("/confirm").post(verifyJwt, confirmPayment); // Confirm a payment

export default router;