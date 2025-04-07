import Router from "express";
import {
  addRating,
  updateRating,
  deleteRating,
  getRatingsForHost,
} from "../controllers/rating.controller.js"; // Import rating controller methods
import { verifyJwt } from "../middlewares/auth.middlewares.js"; // Import JWT verification middleware

const router = Router();

// Protected routes (require JWT authentication)
router.route("/").post(verifyJwt, addRating); // Add a rating for a host
router.route("/:id").put(verifyJwt, updateRating); // Update a rating for a host
router.route("/:id").delete(verifyJwt, deleteRating); // Delete a rating for a host

// Public route
router.route("/host/:hostId").get(getRatingsForHost); // Fetch all ratings for a specific host

export default router;