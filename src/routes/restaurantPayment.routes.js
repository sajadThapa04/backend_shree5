import {verifyJwt} from "../middlewares/auth.middlewares.js";
import {
  createRestaurantPayment, confirmRestaurantPayment, updateRestaurantPaymentStatus, getUserRestaurantPayments, getRestaurantPaymentById
  //   handleRestaurantPaymentRefund
} from "../controllers/restaurantPayment.controller.js";
import Route from "express";

const router = Route();

// Protected routes (require JWT authentication)
router.route("/").post(verifyJwt, createRestaurantPayment); // Create a new payment
router.route("/:id/status").put(verifyJwt, updateRestaurantPaymentStatus); // Update payment status
router.route("/user").get(verifyJwt, getUserRestaurantPayments); // Fetch all payments for a specific user
router.route("/:id").get(verifyJwt, getRestaurantPaymentById); // Fetch payment details by ID
router.route("/confirm").post(verifyJwt, confirmRestaurantPayment); // Confirm a payment

export default router;
