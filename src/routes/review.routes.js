import Router from "express";
import {addReview, updateReview, deleteReview, getReviewsForHost} from "../controllers/review.controller.js"; // Import review controller methods
import {verifyJwt} from "../middlewares/auth.middlewares.js"; // Import JWT verification middleware

const router = Router();

// Protected routes (require JWT authentication)
router.route("/").post(verifyJwt, addReview); // Add a review for a host
router.route("/:id").put(verifyJwt, updateReview); // Update a review for a host
router.route("/:id").delete(verifyJwt, deleteReview); // Delete a review for a host

// Public route
router.route("/host/:hostId").get(getReviewsForHost); // Fetch all reviews for a specific host

export default router;