import express from "express";
import {
  createService, updateService, deleteService, getServicesForHost, getServiceNames // Add the new controller
} from "../controllers/service.controller.js";
import {upload} from "../middlewares/multer.middlewares.js";
import {verifyJwt} from "../middlewares/auth.middlewares.js";

const router = express.Router();

// Public routes
router.get("/public/names", getServiceNames); // New public route

// Protected routes
router.post("/", verifyJwt, createService);
router.patch("/:id", verifyJwt, updateService);
router.delete("/:id", verifyJwt, deleteService);
router.get("/host/:hostId/services", verifyJwt, getServicesForHost);

export default router;