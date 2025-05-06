import Router from "express";
import {createBooking, updateBooking, cancelBooking, getUserBookings, getServiceBooking} from "../controllers/roombooking.controller.js"; // Import booking controller methods
import {verifyJwt} from "../middlewares/auth.middlewares.js"; // Import JWT verification middleware

const router = Router();

// Protected routes (require JWT authentication)
router.route("/").post(verifyJwt, createBooking); // Create a new booking
router.route("/:id").patch(verifyJwt, updateBooking); // Update a booking
router.route("/:id").delete(verifyJwt, cancelBooking); // Cancel a booking
router.route("/user").get(verifyJwt, getUserBookings); // Fetch all bookings for a specific user
router.route("/service/:serviceId").get(verifyJwt, getServiceBooking); // Fetch all bookings for a specific host

export default router;