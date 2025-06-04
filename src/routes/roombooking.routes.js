import Router from "express";
import {
  createUserBooking,
  createGuestBooking,
  updateBooking,
  cancelBooking,
  getUserBookings,
  getServiceBooking
} from "../controllers/roombooking.controller.js";
import {verifyJwt} from "../middlewares/auth.middlewares.js";
import {verifyGuestBooking} from "../middlewares/guest.middlewares.js";

const router = Router();

// Authenticated user booking
router.post("/user", verifyJwt, createUserBooking);

// Guest booking
router.post("/guest", verifyGuestBooking, createGuestBooking);

// Protected routes (require JWT authentication)
router.route("/:id").patch(verifyJwt, updateBooking).delete(verifyJwt, cancelBooking);

// Get bookings
router.get("/user", verifyJwt, getUserBookings);

// Host-only routes
router.get("/service/:serviceId", verifyJwt, getServiceBooking);

export default router;