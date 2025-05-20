import Router from "express";
import {createBooking, updateBooking, cancelBooking, getUserBookings, getServiceBooking} from "../controllers/roombooking.controller.js";
import {verifyJwt} from "../middlewares/auth.middlewares.js";
import {verifyGuestBooking} from "../middlewares/guest.middlewares.js"; // New middleware for guest validation

const router = Router();

// Authenticated user booking
router.post("/user", verifyJwt, createBooking);

// Guest booking
router.post("/guest", verifyGuestBooking, createBooking);

// Protected routes (require JWT authentication)
router.route("/:id").patch(verifyJwt, updateBooking). // Update a booking
delete(verifyJwt, cancelBooking); // Cancel a booking

// Get bookings - supports both authenticated and guest access
router.route("/user").get(verifyJwt, getUserBookings). // Authenticated user
get(getUserBookings); // Guest access (with email query parameter)

// Host-only routes
router.route("/service/:serviceId").get(verifyJwt, getServiceBooking); // Fetch all bookings for a specific host

export default router;