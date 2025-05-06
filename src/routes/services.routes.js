import express from "express";
import {
  createService, updateService, deleteService, getServicesForHost
  // uploadServiceImages,
  // updateServiceImages
} from "../controllers/service.controller.js";
import {upload} from "../middlewares/multer.middlewares.js"; // Multer middleware for file uploads
import {verifyJwt} from "../middlewares/auth.middlewares.js"; // Authentication middleware

const router = express.Router();

// Create a new service (Requires JWT verification)
router.post("/", verifyJwt, createService);

// Update a service (Requires JWT verification)
router.patch("/:id", verifyJwt, updateService);

// Delete a service (Requires JWT verification)
router.delete("/:id", verifyJwt, deleteService);

// Fetch all services for a specific host (No authentication required)
router.get("/host/:hostId/services", verifyJwt, getServicesForHost);

//  Upload images for a service (Requires JWT verification)
// router.post("/:id/images", verifyJwt, upload.array("images", 10), uploadServiceImages);

//  Update images for a service (Requires JWT verification)
// router.patch("/:id/images", verifyJwt, upload.array("images", 10), updateServiceImages);

export default router;