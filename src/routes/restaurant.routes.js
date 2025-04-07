import express from "express";
import {
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  getRestaurantById,
  getAllRestaurants,
  getRestaurantsByService,
  uploadRestaurantImages,
  updateRestaurantImages
} from "../controllers/restaurants.controller.js";
import {upload} from "../middlewares/multer.middlewares.js";
import {verifyJwt} from "../middlewares/auth.middlewares.js";

const router = express.Router();

// Create a new restaurant (Requires JWT verification)
router.post("/", verifyJwt, createRestaurant);

// Update a restaurant (Requires JWT verification)
router.patch("/:id", verifyJwt, updateRestaurant);

// Delete a restaurant (Requires JWT verification)
router.delete("/:id", verifyJwt, deleteRestaurant);

// Fetch all restaurants
router.get("/", getAllRestaurants);

// Fetch a restaurant by ID
router.get("/:id", getRestaurantById);

// Fetch restaurants by service ID
router.get("/service/:serviceId", getRestaurantsByService);

// Upload images for a restaurant (Requires JWT verification)
router.post("/:id/images", verifyJwt, upload.array("images", 10), uploadRestaurantImages);

// Update images for a restaurant (Requires JWT verification)
router.patch("/:id/images", verifyJwt, upload.array("images", 10), updateRestaurantImages);

export default router;