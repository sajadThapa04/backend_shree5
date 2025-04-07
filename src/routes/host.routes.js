import express from "express";
import {
  createHost,
  getHostById,
  updateHost,
  deleteHost,
  getAllHosts,
  searchHosts,
  getHostsByUser
  // updateHostStatus,
  // featureHost
} from "../controllers/host.controller.js";
import {verifyJwt} from "../middlewares/auth.middlewares.js"; // Assuming you have an authentication middleware

const router = express.Router();

// Public Routes

// Search hosts by location, type, or other criteria (No authentication required)
router.get("/search", searchHosts);

// Get a host profile by ID (No authentication required)
router.get("/:id", getHostById);

// Get all host profiles (with pagination) (No authentication required)
router.get("/", getAllHosts);

// Private Routes (Require authentication)

// Create a new host profile (Requires JWT verification)
router.post("/", verifyJwt, createHost);

// Update a host profile (Requires JWT verification)
router.patch("/:id", verifyJwt, updateHost);

//  Upload images for a host profile (Requires JWT verification)
// router.route("/:id/images").post(verifyJwt, upload.array("images", 10), uploadImages);

//  Update a host images (Requires JWT verification)
// router.route("/:id/images").patch(verifyJwt, upload.array("images", 10), updateImages);

// Delete a host profile (Requires JWT verification)
router.delete("/:id", verifyJwt, deleteHost);

// Get all host profiles for a specific user (Requires JWT verification)
router.get("/user/:userId", verifyJwt, getHostsByUser);

// Add a review to a host profile (Requires JWT verification)
// router.post("/:id/reviews", verifyJwt, addReview);

// Update the status of a host profile (e.g., active, inactive, pending, rejected) (Requires JWT verification)
// router.patch("/:id/status", verifyJwt, updateHostStatus);

// Feature a host profile (set as featured) (Requires JWT verification)
// router.patch("/:id/feature", verifyJwt, featureHost);

export default router;
