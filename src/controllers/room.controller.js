import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {Room} from "../models/room.model.js";
import {Service} from "../models/services.model.js";
import {Host} from "../models/host.model.js";
import logger from "../utils/logger.js";
import {uploadOnCloudinary, deleteFromCloudinary} from "../utils/cloudinary.js";
import mongoose from "mongoose";
// Create a new room

const createRoom = asyncHandler(async (req, res) => {
  try {
    // Destructure and validate input data
    const {
      service,
      name,
      roomType,
      pricePerNight,
      capacity,
      amenities,
      isAvailable
    } = req.body;

    // Log the incoming request body for debugging
    logger.info("Incoming request body:", req.body);

    // Check for required fields
    if (!service || !name || !roomType || !pricePerNight || !capacity) {
      logger.error("Missing required fields in request body.");
      throw new ApiError(400, "All required fields must be provided.");
    }

    // Validate room type
    const validRoomTypes = ["single", "double", "suite", "other"];
    if (!validRoomTypes.includes(roomType)) {
      logger.error(`Invalid room type provided: ${roomType}`);
      throw new ApiError(400, "Invalid room type.");
    }

    // Validate price per night
    if (pricePerNight < 0) {
      logger.error(`Invalid price per night provided: ${pricePerNight}`);
      throw new ApiError(400, "Price per night cannot be negative.");
    }

    // Validate capacity
    if (capacity < 1) {
      logger.error(`Invalid capacity provided: ${capacity}`);
      throw new ApiError(400, "Capacity must be at least 1.");
    }

    // Check if the service exists
    const existingService = await Service.findById(service);
    if (!existingService) {
      logger.error(`Service not found with ID: ${service}`);
      throw new ApiError(404, "Service not found.");
    }

    // Check if the authenticated user is authorized to create the room
    const userId = req.user
      ?._id; // Authenticated user's ID
    if (!userId) {
      logger.error("User not authenticated.");
      throw new ApiError(401, "User not authenticated.");
    }

    // Fetch the host associated with the service
    const host = await Host.findById(existingService.host);
    if (!host) {
      logger.error(`Host not found for service ID: ${service}`);
      throw new ApiError(404, "Host not found.");
    }

    // Check if the authenticated user is the owner of the host profile
    if (host.user.toString() !== userId.toString()) {
      logger.error(`User ${userId} is not authorized to create a room for service ${service}`);
      throw new ApiError(403, "You are not authorized to create a room for this service.");
    }

    // Create the room object
    const room = new Room({
      service,
      name,
      roomType,
      pricePerNight,
      capacity,
      amenities: amenities || [], // Default to an empty array if not provided
      isAvailable: isAvailable !== undefined
        ? isAvailable
        : true // Default to true if not provided
    });

    // Save the room to the database
    const savedRoom = await room.save();
    if (!savedRoom) {
      logger.error("Failed to save the room to the database.");
      throw new ApiError(500, "Failed to save the room to the database.");
    }

    // Log the successful creation of the room
    logger.info(`Room created successfully with ID: ${savedRoom._id}`);

    // Return the created room
    res.status(201).json(new ApiResponse(201, savedRoom, "Room created successfully."));
  } catch (error) {
    // Handle duplicate key error for room name
    if (
      error.code === 11000 && error.keyPattern
      ?.name) {
      throw new ApiError(400, "A room with this name already exists.");
    }
    throw error; // Re-throw other errors
  }
});

// Get all rooms
const getAllRooms = asyncHandler(async (req, res) => {
  logger.info("Fetching all rooms from the database.");

  try {
    // Fetch all rooms from the database
    const rooms = await Room.find({});

    // If no rooms are found, return an empty array
    if (!rooms || rooms.length === 0) {
      logger.info("No rooms found in the database.");
      return res.status(200).json(new ApiResponse(200, [], "No rooms found."));
    }

    // Log the number of rooms fetched
    logger.info(`Fetched ${rooms.length} rooms from the database.`);

    // Return the list of rooms
    res.status(200).json(new ApiResponse(200, rooms, "Rooms fetched successfully."));
  } catch (error) {
    // Log the error
    logger.error(`Error fetching rooms: ${error.message}`);

    // Throw an ApiError if something goes wrong
    throw new ApiError(500, "Failed to fetch rooms due to an internal server error.");
  }
});

// Get a room by ID
const getRoomById = asyncHandler(async (req, res) => {
  const {id} = req.params;

  logger.info(`Fetching room by ID: ${id}`);

  // Step 1: Validate the room ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    logger.error(`Invalid room ID: ${id}`);
    throw new ApiError(400, "Invalid room ID.");
  }

  // Step 2: Fetch the room from the database
  const room = await Room.findById(id);

  // Step 3: Check if the room exists
  if (!room) {
    logger.error(`Room not found with ID: ${id}`);
    throw new ApiError(404, "Room not found.");
  }

  // Step 4: Return the room details
  logger.info(`Room fetched successfully with ID: ${id}`);
  res.status(200).json(new ApiResponse(200, room, "Room fetched successfully."));
});

// Get rooms by service ID
const getRoomsByService = asyncHandler(async (req, res) => {
  const {serviceId} = req.params;

  logger.info(`Fetching rooms for service ID: ${serviceId}`);

  // Step 1: Validate the service ID
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    logger.error(`Invalid service ID: ${serviceId}`);
    throw new ApiError(400, "Invalid service ID.");
  }

  // Step 2: Check if the service exists
  const serviceExists = await Service.findById(serviceId);
  if (!serviceExists) {
    logger.error(`Service not found with ID: ${serviceId}`);
    throw new ApiError(404, "Service not found.");
  }

  // Step 3: Fetch rooms associated with the service
  const rooms = await Room.find({service: serviceId});

  // Step 4: Check if rooms exist for the service
  if (!rooms || rooms.length === 0) {
    logger.info(`No rooms found for service ID: ${serviceId}`);
    return res.status(200).json(new ApiResponse(200, [], "No rooms found for this service."));
  }

  // Step 5: Return the list of rooms
  logger.info(`Fetched ${rooms.length} rooms for service ID: ${serviceId}`);
  res.status(200).json(new ApiResponse(200, rooms, "Rooms fetched successfully."));
});

// Get rooms by room type
const getRoomsByType = asyncHandler(async (req, res) => {
  const {roomType} = req.params;

  logger.info(`Fetching rooms of type: ${roomType}`);

  // Step 1: Validate the room type
  const validRoomTypes = ["single", "double", "suite", "other"];
  if (!validRoomTypes.includes(roomType)) {
    logger.error(`Invalid room type: ${roomType}`);
    throw new ApiError(400, `Invalid room type. Allowed types: ${validRoomTypes.join(", ")}`);
  }

  // Step 2: Fetch rooms of the specified type
  const rooms = await Room.find({roomType});

  // Step 3: Check if rooms exist for the specified type
  if (!rooms || rooms.length === 0) {
    logger.info(`No rooms found for room type: ${roomType}`);
    return res.status(200).json(new ApiResponse(200, [], `No rooms found for room type: ${roomType}`));
  }

  // Step 4: Return the list of rooms
  logger.info(`Fetched ${rooms.length} rooms of type: ${roomType}`);
  res.status(200).json(new ApiResponse(200, rooms, "Rooms fetched successfully."));
});

const updateRoom = asyncHandler(async (req, res) => {
  const {id} = req.params; // Room ID
  const userId = req.user._id; // Authenticated user's ID
  const updateData = req.body; // Data to update

  logger.info(`Starting updateRoom process for room ID: ${id} by user ID: ${userId}`);

  // Step 1: Validate the room ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    logger.error(`Invalid room ID: ${id}`);
    throw new ApiError(400, "Invalid room ID.");
  }

  // Step 2: Fetch the room from the database
  const room = await Room.findById(id);
  if (!room) {
    logger.error(`Room not found with ID: ${id}`);
    throw new ApiError(404, "Room not found.");
  }

  // Step 3: Fetch the service associated with the room
  const service = await Service.findById(room.service);
  if (!service) {
    logger.error(`Service not found for room ID: ${id}`);
    throw new ApiError(404, "Service not found.");
  }

  // Step 4: Fetch the host associated with the service
  const host = await Host.findById(service.host);
  if (!host) {
    logger.error(`Host not found for service ID: ${service._id}`);
    throw new ApiError(404, "Host not found.");
  }

  // Step 5: Check if the authenticated user is authorized to update the room
  if (host.user.toString() !== userId.toString()) {
    logger.error(`User ${userId} is not authorized to update room ${id}`);
    throw new ApiError(403, "You are not authorized to update this room.");
  }

  // Step 6: Validate update data (optional, based on your requirements)
  if (updateData.pricePerNight && updateData.pricePerNight < 0) {
    logger.error(`Invalid price per night provided: ${updateData.pricePerNight}`);
    throw new ApiError(400, "Price per night cannot be negative.");
  }

  if (updateData.capacity && updateData.capacity < 1) {
    logger.error(`Invalid capacity provided: ${updateData.capacity}`);
    throw new ApiError(400, "Capacity must be at least 1.");
  }

  if (updateData.roomType) {
    const validRoomTypes = ["single", "double", "suite", "other"];
    if (!validRoomTypes.includes(updateData.roomType)) {
      logger.error(`Invalid room type provided: ${updateData.roomType}`);
      throw new ApiError(400, "Invalid room type.");
    }
  }

  // Step 7: Check for duplicate name if the name is being updated
  if (updateData.name) {
    const existingRoom = await Room.findOne({name: updateData.name});
    if (existingRoom && existingRoom._id.toString() !== id) {
      logger.error(`A room with the name "${updateData.name}" already exists.`);
      throw new ApiError(400, "A room with this name already exists.");
    }
  }

  // Step 8: Update the room details
  const updatedRoom = await Room.findByIdAndUpdate(id, updateData, {
    new: true, // Return the updated document
    runValidators: true // Run schema validators on update
  });

  if (!updatedRoom) {
    logger.error(`Failed to update room with ID: ${id}`);
    throw new ApiError(500, "Failed to update the room.");
  }

  // Step 9: Log the successful update
  logger.info(`Room updated successfully with ID: ${id}`);

  // Step 10: Return the updated room
  res.status(200).json(new ApiResponse(200, updatedRoom, "Room updated successfully."));
});

const deleteRoom = asyncHandler(async (req, res) => {
  const {id} = req.params; // Room ID
  const userId = req.user._id; // Authenticated user's ID

  logger.info(`Starting deleteRoom process for room ID: ${id} by user ID: ${userId}`);

  // Step 1: Validate the room ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    logger.error(`Invalid room ID: ${id}`);
    throw new ApiError(400, "Invalid room ID.");
  }

  // Step 2: Fetch the room from the database
  const room = await Room.findById(id);
  if (!room) {
    logger.error(`Room not found with ID: ${id}`);
    throw new ApiError(404, "Room not found.");
  }

  // Step 3: Fetch the service associated with the room
  const service = await Service.findById(room.service);
  if (!service) {
    logger.error(`Service not found for room ID: ${id}`);
    throw new ApiError(404, "Service not found.");
  }

  // Step 4: Fetch the host associated with the service
  const host = await Host.findById(service.host);
  if (!host) {
    logger.error(`Host not found for service ID: ${service._id}`);
    throw new ApiError(404, "Host not found.");
  }

  // Step 5: Check if the authenticated user is authorized to delete the room
  if (host.user.toString() !== userId.toString()) {
    logger.error(`User ${userId} is not authorized to delete room ${id}`);
    throw new ApiError(403, "You are not authorized to delete this room.");
  }

  // Step 6: Delete associated images from Cloudinary
  if (room.images && room.images.length > 0) {
    for (const imageUrl of room.images) {
      try {
        await deleteFromCloudinary(imageUrl);
        logger.info(`Deleted image from Cloudinary: ${imageUrl}`);
      } catch (error) {
        logger.error(`Failed to delete image from Cloudinary: ${imageUrl}`, error);
        throw new ApiError(500, "Failed to delete images from Cloudinary.");
      }
    }
  }

  // Step 7: Delete the room from the database
  const deletedRoom = await Room.findByIdAndDelete(id);
  if (!deletedRoom) {
    logger.error(`Failed to delete room with ID: ${id}`);
    throw new ApiError(500, "Failed to delete the room.");
  }

  // Step 8: Log the successful deletion
  logger.info(`Room deleted successfully with ID: ${id}`);

  // Step 9: Return a success message
  res.status(200).json(new ApiResponse(200, null, "Room deleted successfully."));
});

//upload images of room
const uploadRoomImages = asyncHandler(async (req, res) => {
  const {id} = req.params; // Room ID
  const userId = req.user._id; // Authenticated user's ID
  const files = req.files; // Uploaded images from multer

  logger.info(`Starting uploadRoomImages process for room ID: ${id} by user ID: ${userId}`);

  // Step 1: Validate the room ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    logger.error(`Invalid room ID: ${id}`);
    throw new ApiError(400, "Invalid room ID.");
  }

  // Step 2: Fetch the room from the database
  const room = await Room.findById(id);
  if (!room) {
    logger.error(`Room not found with ID: ${id}`);
    throw new ApiError(404, "Room not found.");
  }

  // Step 3: Fetch the service associated with the room
  const service = await Service.findById(room.service);
  if (!service) {
    logger.error(`Service not found for room ID: ${id}`);
    throw new ApiError(404, "Service not found.");
  }

  // Step 4: Fetch the host associated with the service
  const host = await Host.findById(service.host);
  if (!host) {
    logger.error(`Host not found for service ID: ${service._id}`);
    throw new ApiError(404, "Host not found.");
  }

  // Step 5: Check if the authenticated user is authorized to upload images
  if (host.user.toString() !== userId.toString()) {
    logger.error(`User ${userId} is not authorized to upload images for room ${id}`);
    throw new ApiError(403, "You are not authorized to upload images for this room.");
  }

  // Step 6: Check if images were uploaded
  if (!files || files.length === 0) {
    logger.error("No images were uploaded.");
    throw new ApiError(400, "No images were uploaded.");
  }

  // Step 7: Upload images to Cloudinary
  const imageUrls = [];
  for (const file of files) {
    try {
      const cloudinaryResponse = await uploadOnCloudinary(file.path);
      if (cloudinaryResponse && cloudinaryResponse.secure_url) {
        imageUrls.push(cloudinaryResponse.secure_url);
        logger.info(`Image uploaded to Cloudinary: ${cloudinaryResponse.secure_url}`);
      } else {
        logger.error("Failed to upload image to Cloudinary.");
        throw new ApiError(500, "Failed to upload images to Cloudinary.");
      }
    } catch (error) {
      logger.error(`Error uploading image to Cloudinary: ${error.message}`);
      throw new ApiError(500, "Failed to upload images to Cloudinary.");
    }
  }

  // Step 8: Update the room document with the new image URLs
  room.images = room.images.concat(imageUrls); // Append new images to existing ones
  const updatedRoom = await room.save();

  if (!updatedRoom) {
    logger.error(`Failed to update room with ID: ${id}`);
    throw new ApiError(500, "Failed to update the room with new images.");
  }

  // Step 9: Return the updated room
  logger.info(`Room images uploaded successfully for room ID: ${id}`);
  res.status(200).json(new ApiResponse(200, updatedRoom, "Room images uploaded successfully."));
});

//update images of room
const updateRoomImages = asyncHandler(async (req, res) => {
  const {id} = req.params; // Room ID
  const userId = req.user._id; // Authenticated user's ID
  const files = req.files; // Uploaded images from multer

  logger.info(`Starting updateRoomImages process for room ID: ${id} by user ID: ${userId}`);

  // Step 1: Validate the room ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    logger.error(`Invalid room ID: ${id}`);
    throw new ApiError(400, "Invalid room ID.");
  }

  // Step 2: Fetch the room from the database
  const room = await Room.findById(id);
  if (!room) {
    logger.error(`Room not found with ID: ${id}`);
    throw new ApiError(404, "Room not found.");
  }

  // Step 3: Fetch the service associated with the room
  const service = await Service.findById(room.service);
  if (!service) {
    logger.error(`Service not found for room ID: ${id}`);
    throw new ApiError(404, "Service not found.");
  }

  // Step 4: Fetch the host associated with the service
  const host = await Host.findById(service.host);
  if (!host) {
    logger.error(`Host not found for service ID: ${service._id}`);
    throw new ApiError(404, "Host not found.");
  }

  // Step 5: Check if the authenticated user is authorized to update images
  if (host.user.toString() !== userId.toString()) {
    logger.error(`User ${userId} is not authorized to update images for room ${id}`);
    throw new ApiError(403, "You are not authorized to update images for this room.");
  }

  // Step 6: Check if images were uploaded
  if (!files || files.length === 0) {
    logger.error("No images were uploaded.");
    throw new ApiError(400, "No images were uploaded.");
  }

  // Step 7: Delete old images from Cloudinary
  if (room.images && room.images.length > 0) {
    for (const imageUrl of room.images) {
      try {
        await deleteFromCloudinary(imageUrl);
        logger.info(`Deleted old image from Cloudinary: ${imageUrl}`);
      } catch (error) {
        logger.error(`Failed to delete old image from Cloudinary: ${imageUrl}`, error);
        throw new ApiError(500, "Failed to delete old images from Cloudinary.");
      }
    }
  }

  // Step 8: Upload new images to Cloudinary
  const newImageUrls = [];
  for (const file of files) {
    try {
      const cloudinaryResponse = await uploadOnCloudinary(file.path);
      if (cloudinaryResponse && cloudinaryResponse.secure_url) {
        newImageUrls.push(cloudinaryResponse.secure_url);
        logger.info(`New image uploaded to Cloudinary: ${cloudinaryResponse.secure_url}`);
      } else {
        logger.error("Failed to upload new image to Cloudinary.");
        throw new ApiError(500, "Failed to upload new images to Cloudinary.");
      }
    } catch (error) {
      logger.error(`Error uploading new image to Cloudinary: ${error.message}`);
      throw new ApiError(500, "Failed to upload new images to Cloudinary.");
    }
  }

  // Step 9: Update the room document with the new image URLs
  room.images = newImageUrls; // Replace old images with new ones
  const updatedRoom = await room.save();

  if (!updatedRoom) {
    logger.error(`Failed to update room with ID: ${id}`);
    throw new ApiError(500, "Failed to update the room with new images.");
  }

  // Step 10: Return the updated room
  logger.info(`Room images updated successfully for room ID: ${id}`);
  res.status(200).json(new ApiResponse(200, updatedRoom, "Room images updated successfully."));
});

export {
  createRoom,
  getAllRooms,
  getRoomById,
  getRoomsByService,
  getRoomsByType,
  updateRoom,
  deleteRoom,
  uploadRoomImages,
  updateRoomImages
};