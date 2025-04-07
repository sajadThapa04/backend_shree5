import Router from "express";
import {createBooking, updateBooking, cancelBooking, getUserBookings, getHostBookings} from "../controllers/booking.controller.js"; // Import booking controller methods
import {verifyJwt} from "../middlewares/auth.middlewares.js"; // Import JWT verification middleware

const router = Router();

// Protected routes (require JWT authentication)
router.route("/").post(verifyJwt, createBooking); // Create a new booking
router.route("/:id").put(verifyJwt, updateBooking); // Update a booking
router.route("/:id").delete(verifyJwt, cancelBooking); // Cancel a booking
router.route("/user").get(verifyJwt, getUserBookings); // Fetch all bookings for a specific user

// Public routes
router.route("/host/:hostId/bookings").get(verifyJwt, getHostBookings); // Fetch all bookings for a specific host

export default router;