import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {Room} from "../models/room.model.js";
import {Service} from "../models/services.model.js";
import {Host} from "../models/host.model.js";
import {User} from "../models/user.model.js";
import logger from "../utils/logger.js";
import {uploadOnCloudinary, deleteFromCloudinary} from "../utils/cloudinary.js";
import mongoose from "mongoose";
// Create a new room

const createRoom = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      name,
      roomType,
      description,
      pricePerNight,
      capacity,
      size,
      floorNumber,
      hasPrivatePool,
      bedType,
      bathroomType,
      amenities,
      tags,
      images,
      isAvailable,
      openingHours,
      pricingModel,
      service
    } = req.body;

    const userId = req.user
      ?._id;

    logger.info(`Starting room creation process for user: ${userId}`);

    // Validate required fields
    if (!name || !roomType || pricePerNight === undefined || !capacity || !service) {
      logger.error("Missing required fields");
      throw new ApiError(400, "All required fields must be provided.");
    }

    // Verify the service exists and belongs to the host
    const existingService = await Service.findById(service).session(session);
    if (!existingService) {
      logger.error(`Service not found: ${service}`);
      throw new ApiError(404, "Service not found");
    }

    // Verify service ownership
    const host = await Host.findOne({user: userId}).session(session);
    if (!host || !existingService.host.equals(host._id)) {
      logger.error(`Service ownership verification failed for user: ${userId}`);
      throw new ApiError(403, "You don't have permission to use this service");
    }

    // Validate room type
    const validRoomTypes = [
      "single",
      "double",
      "twin",
      "triple",
      "queen",
      "king",
      "family",
      "suite",
      "presidential",
      "dormitory",
      "cottage",
      "tent",
      "penthouse",
      "honeymoon",
      "studio",
      "shared",
      "private",
      "entire_home",
      "other"
    ];

    if (!validRoomTypes.includes(roomType)) {
      logger.error(`Invalid room type provided: ${roomType}`);
      throw new ApiError(400, `Invalid room type. Valid types are: ${validRoomTypes.join(", ")}`);
    }

    // Validate price per night
    if (pricePerNight < 0) {
      logger.error(`Invalid price per night: ${pricePerNight}`);
      throw new ApiError(400, "Price per night cannot be negative.");
    }

    // Validate capacity
    if (!capacity.adults || capacity.adults < 1) {
      logger.error(`Invalid adult capacity: ${capacity.adults}`);
      throw new ApiError(400, "Must accommodate at least 1 adult.");
    }

    if (capacity.children && capacity.children < 0) {
      logger.error(`Invalid children capacity: ${capacity.children}`);
      throw new ApiError(400, "Children capacity cannot be negative.");
    }

    // Validate room features
    if (size !== undefined && size < 0) {
      logger.error(`Invalid room size: ${size}`);
      throw new ApiError(400, "Room size cannot be negative.");
    }

    if (floorNumber !== undefined && floorNumber < 0) {
      logger.error(`Invalid floor number: ${floorNumber}`);
      throw new ApiError(400, "Floor number cannot be negative.");
    }

    // Validate bed type
    const validBedTypes = [
      "king",
      "queen",
      "double",
      "single",
      "bunk",
      "floor_mattress",
      "other"
    ];
    if (bedType && !validBedTypes.includes(bedType)) {
      logger.error(`Invalid bed type: ${bedType}`);
      throw new ApiError(400, `Invalid bed type. Valid types are: ${validBedTypes.join(", ")}`);
    }

    // Validate bathroom type
    const validBathroomTypes = ["shared", "private", "ensuite"];
    if (bathroomType && !validBathroomTypes.includes(bathroomType)) {
      logger.error(`Invalid bathroom type: ${bathroomType}`);
      throw new ApiError(400, `Invalid bathroom type. Valid types are: ${validBathroomTypes.join(", ")}`);
    }

    // Validate pricing model
    const validPricingModels = ["static", "dynamic"];
    if (pricingModel && !validPricingModels.includes(pricingModel)) {
      logger.error(`Invalid pricing model: ${pricingModel}`);
      throw new ApiError(400, `Invalid pricing model. Valid models are: ${validPricingModels.join(", ")}`);
    }

    // Validate openingHours if provided
    if (openingHours) {
      const days = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday"
      ];
      const openingHoursMap = {};

      for (const day of openingHours) {
        if (!days.includes(day.day)) {
          logger.error(`Invalid day in opening hours: ${day.day}`);
          throw new ApiError(400, `Invalid day: ${day.day}`);
        }

        if (!day.timeSlots || !Array.isArray(day.timeSlots)) {
          logger.error(`Missing time slots for day: ${day.day}`);
          throw new ApiError(400, `Time slots array is required for ${day.day}`);
        }

        for (const slot of day.timeSlots) {
          if (!slot.openingTime || !slot.closingTime) {
            logger.error(`Missing opening/closing times for ${day.day}`);
            throw new ApiError(400, `Both opening and closing times are required for ${day.day}`);
          }

          const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(slot.openingTime) || !timeRegex.test(slot.closingTime)) {
            logger.error(`Invalid time format for ${day.day}`);
            throw new ApiError(400, `Times for ${day.day} must be in HH:mm format.`);
          }
        }

        openingHoursMap[day.day] = day;
      }

      // Check if all days are covered if openingHours is provided
      for (const day of days) {
        if (!openingHoursMap[day]) {
          logger.error(`Missing opening hours for day: ${day}`);
          throw new ApiError(400, `Opening hours for ${day} are required.`);
        }
      }
    }

    // Validate images structure if provided
    if (images && Array.isArray(images)) {
      for (const image of images) {
        if (!image.url) {
          logger.error("Image missing URL");
          throw new ApiError(400, "All images must have a URL.");
        }
      }
    }

    // Create the room
    const room = new Room({
      service: existingService._id,
      name,
      roomType,
      description: description || "",
      pricePerNight,
      capacity: {
        adults: capacity.adults,
        children: capacity.children || 0
      },
      size: size || undefined,
      floorNumber: floorNumber || undefined,
      hasPrivatePool: hasPrivatePool || false,
      bedType: bedType || "queen",
      bathroomType: bathroomType || "private",
      amenities: amenities || [],
      tags: tags || [],
      images: images || [],
      isAvailable: isAvailable !== undefined
        ? isAvailable
        : true,
      openingHours: openingHours || [],
      pricingModel: pricingModel || "static"
    });

    const savedRoom = await room.save({session});

    await session.commitTransaction();
    logger.info(`Room created successfully: ${savedRoom._id}`);
    res.status(201).json(new ApiResponse(201, savedRoom, "Room created successfully."));
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error in createRoom: ${error.message}`, {stack: error.stack});

    if (error instanceof ApiError) {
      throw error;
    }
    if (error.name === "ValidationError") {
      throw new ApiError(400, error.message);
    }
    if (error.code === 11000) {
      throw new ApiError(400, "A room with this name already exists");
    }
    throw new ApiError(500, error.message || "Failed to create room");
  } finally {
    session.endSession();
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
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params; // Room ID
    const userId = req.user._id; // Authenticated user's ID
    const updateData = req.body; // Data to update

    logger.info(`Starting room update process for room ID: ${id} by user ID: ${userId}`);

    // Validate the room ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.error(`Invalid room ID: ${id}`);
      throw new ApiError(400, "Invalid room ID.");
    }

    // Fetch the room with session
    const room = await Room.findById(id).session(session);
    if (!room) {
      logger.error(`Room not found with ID: ${id}`);
      throw new ApiError(404, "Room not found.");
    }

    // Fetch the service associated with the room
    const service = await Service.findById(room.service).session(session);
    if (!service) {
      logger.error(`Service not found for room ID: ${id}`);
      throw new ApiError(404, "Service not found.");
    }

    // Verify service ownership
    const host = await Host.findOne({ user: userId }).session(session);
    if (!host || !service.host.equals(host._id)) {
      logger.error(`User ${userId} is not authorized to update room ${id}`);
      throw new ApiError(403, "You are not authorized to update this room.");
    }

    // Validate update data
    if (updateData.pricePerNight !== undefined && updateData.pricePerNight < 0) {
      logger.error(`Invalid price per night: ${updateData.pricePerNight}`);
      throw new ApiError(400, "Price per night cannot be negative.");
    }

    if (updateData.capacity) {
      if (updateData.capacity.adults !== undefined && updateData.capacity.adults < 1) {
        logger.error(`Invalid adult capacity: ${updateData.capacity.adults}`);
        throw new ApiError(400, "Must accommodate at least 1 adult.");
      }
      if (updateData.capacity.children !== undefined && updateData.capacity.children < 0) {
        logger.error(`Invalid children capacity: ${updateData.capacity.children}`);
        throw new ApiError(400, "Children capacity cannot be negative.");
      }
    }

    // Validate room type
    const validRoomTypes = [
      "single", "double", "twin", "triple", "queen", "king",
      "family", "suite", "presidential", "dormitory", "cottage",
      "tent", "penthouse", "honeymoon", "studio", "shared",
      "private", "entire_home", "other"
    ];
    if (updateData.roomType && !validRoomTypes.includes(updateData.roomType)) {
      logger.error(`Invalid room type: ${updateData.roomType}`);
      throw new ApiError(400, `Invalid room type. Valid types are: ${validRoomTypes.join(', ')}`);
    }

    // Validate bed type
    const validBedTypes = ["king", "queen", "double", "single", "bunk", "floor_mattress", "other"];
    if (updateData.bedType && !validBedTypes.includes(updateData.bedType)) {
      logger.error(`Invalid bed type: ${updateData.bedType}`);
      throw new ApiError(400, `Invalid bed type. Valid types are: ${validBedTypes.join(', ')}`);
    }

    // Validate bathroom type
    const validBathroomTypes = ["shared", "private", "ensuite"];
    if (updateData.bathroomType && !validBathroomTypes.includes(updateData.bathroomType)) {
      logger.error(`Invalid bathroom type: ${updateData.bathroomType}`);
      throw new ApiError(400, `Invalid bathroom type. Valid types are: ${validBathroomTypes.join(', ')}`);
    }

    // Validate room features
    if (updateData.size !== undefined && updateData.size < 0) {
      logger.error(`Invalid room size: ${updateData.size}`);
      throw new ApiError(400, "Room size cannot be negative.");
    }

    if (updateData.floorNumber !== undefined && updateData.floorNumber < 0) {
      logger.error(`Invalid floor number: ${updateData.floorNumber}`);
      throw new ApiError(400, "Floor number cannot be negative.");
    }

    // Check for duplicate name
    if (updateData.name) {
      const existingRoom = await Room.findOne({ name: updateData.name }).session(session);
      if (existingRoom && existingRoom._id.toString() !== id) {
        logger.error(`Duplicate room name: ${updateData.name}`);
        throw new ApiError(400, "A room with this name already exists.");
      }
    }

    // Validate openingHours if provided
    if (updateData.openingHours) {
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      
      if (!Array.isArray(updateData.openingHours) || updateData.openingHours.length === 0) {
        logger.error("Invalid opening hours array");
        throw new ApiError(400, "Opening hours are required for all days.");
      }

      for (const day of updateData.openingHours) {
        if (!days.includes(day.day)) {
          logger.error(`Invalid day in opening hours: ${day.day}`);
          throw new ApiError(400, `Invalid day: ${day.day}`);
        }

        if (!day.timeSlots || !Array.isArray(day.timeSlots) || day.timeSlots.length === 0) {
          logger.error(`Missing time slots for day: ${day.day}`);
          throw new ApiError(400, `At least one time slot is required for ${day.day}`);
        }

        for (const slot of day.timeSlots) {
          if (!slot.openingTime || !slot.closingTime) {
            logger.error(`Missing opening/closing times for ${day.day}`);
            throw new ApiError(400, `Both opening and closing times are required for ${day.day}`);
          }

          const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(slot.openingTime) || !timeRegex.test(slot.closingTime)) {
            logger.error(`Invalid time format for ${day.day}`);
            throw new ApiError(400, `Times for ${day.day} must be in HH:mm format.`);
          }
        }
      }
    }

    // Update the room
    const updatedRoom = await Room.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true,
        session
      }
    );

    if (!updatedRoom) {
      logger.error(`Failed to update room with ID: ${id}`);
      throw new ApiError(500, "Failed to update the room.");
    }

    await session.commitTransaction();
    logger.info(`Room updated successfully: ${updatedRoom._id}`);
    res.status(200).json(new ApiResponse(200, updatedRoom, "Room updated successfully."));
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error in updateRoom: ${error.message}`, { stack: error.stack });

    if (error instanceof ApiError) {
      throw error;
    }
    if (error.name === "ValidationError") {
      throw new ApiError(400, error.message);
    }
    if (error.code === 11000) {
      throw new ApiError(400, "Duplicate field value entered");
    }
    throw new ApiError(500, error.message || "Failed to update room");
  } finally {
    session.endSession();
  }
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