import express from "express";
import {
  createRoom,
  updateRoom,
  deleteRoom,
  getRoomById,
  getAllRooms,
  getRoomsByService,
  getRoomsByType,
  uploadRoomImages,
  updateRoomImages,
  uploadAccommodationImages,
  updateAccommodationImages
} from "../controllers/room.controller.js";
import {upload} from "../middlewares/multer.middlewares.js"; // Multer middleware for file uploads
import {verifyJwt} from "../middlewares/auth.middlewares.js"; // Authentication middleware

const router = express.Router();

// Create a new room (Requires JWT verification)
router.post("/", verifyJwt, createRoom);

// Update a room (Requires JWT verification)
router.patch("/:id", verifyJwt, updateRoom);

// Delete a room (Requires JWT verification)
router.delete("/:id", verifyJwt, deleteRoom);

// Fetch all rooms
router.get("/", getAllRooms);

// Fetch a room by ID
router.get("/:id", getRoomById);

// Fetch rooms by service ID
router.get("/service/:serviceId", getRoomsByService);

// Fetch rooms by room type
router.get("/type/:roomType", getRoomsByType);

// Upload images for a room (Requires JWT verification)
router.post("/:id/images", verifyJwt, upload.array("images", 10), uploadRoomImages);

// Update images for a room (Requires JWT verification)
router.patch("/:id/images", verifyJwt, upload.array("images", 10), updateRoomImages);

// Upload accomodation_images for a room (Requires JWT verification)
router.post("/:id/accomodation_images", verifyJwt, upload.array("images", 10), updateAccommodationImages);

// update accomodation_images for a room (Requires JWT verification)
router.patch("/:id/accomodation_images", verifyJwt, upload.array("images", 10), updateAccommodationImages);
export default router;