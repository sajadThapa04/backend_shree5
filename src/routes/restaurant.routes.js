import express from "express";
import {
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  getRestaurantById,
  getAllRestaurants,
  getRestaurantsByService,
  uploadRestaurantImages,
  updateRestaurantImages,
  uploadCuisineImages,
  deleteCuisineImage
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
router.get("/:id", verifyJwt,getRestaurantById);

// Fetch restaurants by service ID
router.get("/service/:serviceId", getRestaurantsByService);

// Upload images for a restaurant (Requires JWT verification)
router.post("/:id/images", verifyJwt, upload.array("images", 10), uploadRestaurantImages);

// Update images for a restaurant (Requires JWT verification)
router.patch("/:id/images", verifyJwt, upload.array("images", 10), updateRestaurantImages);

// Upload cuisine image (Requires JWT verification)
router.post("/:id/cuisine/:cuisineId/image", verifyJwt, upload.single("image"), // Single file upload for cuisine image
    uploadCuisineImages);

// Delete cuisine image (Requires JWT verification)
router.delete("/:id/cuisine/:cuisineId/image", verifyJwt, deleteCuisineImage);

export default router;