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
  const startTime = Date.now();
  const requestId = req.requestId || mongoose.Types.ObjectId().toString();
  
  try {
    logger.info(`[${requestId}] Starting room creation process`, {
      action: 'createRoom',
      userId: req.user?._id,
      body: req.body
    });

    const {
      name,
      roomType,
      pricePerNight,
      capacity,
      amenities,
      isAvailable,
      openingHours
    } = req.body;

    // Validate required fields
    if (!name || !roomType || !pricePerNight || !capacity) {
      logger.warn(`[${requestId}] Missing required fields`, { 
        missingFields: {
          name: !name,
          roomType: !roomType,
          pricePerNight: !pricePerNight,
          capacity: !capacity
        }
      });
      throw new ApiError(400, "All required fields must be provided.");
    }

    // Validate room type
    const validRoomTypes = ["single", "double", "suite", "other"];
    if (!validRoomTypes.includes(roomType)) {
      logger.warn(`[${requestId}] Invalid room type provided`, { 
        roomType,
        validRoomTypes 
      });
      throw new ApiError(400, "Invalid room type.");
    }

    // Validate price per night
    if (pricePerNight < 0) {
      logger.warn(`[${requestId}] Invalid price per night`, { pricePerNight });
      throw new ApiError(400, "Price per night cannot be negative.");
    }

    // Validate capacity
    if (capacity < 1) {
      logger.warn(`[${requestId}] Invalid capacity`, { capacity });
      throw new ApiError(400, "Capacity must be at least 1.");
    }

    // Validate openingHours if provided
    if (openingHours) {
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      const openingHoursMap = {};

      for (const day of openingHours) {
        if (!days.includes(day.day)) {
          logger.warn(`[${requestId}] Invalid day in opening hours`, { day });
          throw new ApiError(400, `Invalid day: ${day.day}`);
        }

        if (!day.openingTime || !day.closingTime) {
          logger.warn(`[${requestId}] Missing opening/closing times`, { day });
          throw new ApiError(400, `Opening and closing times for ${day.day} are required.`);
        }

        const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(day.openingTime) || !timeRegex.test(day.closingTime)) {
          logger.warn(`[${requestId}] Invalid time format`, { 
            day: day.day,
            openingTime: day.openingTime,
            closingTime: day.closingTime
          });
          throw new ApiError(400, `Times for ${day.day} must be in HH:mm format.`);
        }

        openingHoursMap[day.day] = day;
      }

      for (const day of days) {
        if (!openingHoursMap[day]) {
          logger.warn(`[${requestId}] Missing opening hours for day`, { day });
          throw new ApiError(400, `Opening hours for ${day} are required.`);
        }
      }
    }

    // Get authenticated user
    const userId = req.user?._id;
    if (!userId) {
      logger.warn(`[${requestId}] Unauthenticated user attempt`);
      throw new ApiError(401, "User not authenticated.");
    }

    // Find the user with host profile
    const user = await User.findById(userId);
    if (!user) {
      logger.warn(`[${requestId}] User not found`, { userId });
      throw new ApiError(404, "User not found.");
    }

    logger.debug(`[${requestId}] User found`, { 
      userId: user._id,
      role: user.role,
      hostProfile: user.hostProfile 
    });

    // If user is a host but hostProfile is null, try to find existing host
    if (user.role === "host" && !user.hostProfile) {
      const existingHost = await Host.findOne({ user: userId });
      if (existingHost) {
        user.hostProfile = existingHost._id;
        await user.save();
        logger.info(`[${requestId}] Associated existing host profile with user`, {
          hostId: existingHost._id,
          userId: user._id
        });
      }
    }

    // Final check for host profile
    if (!user.hostProfile) {
      logger.warn(`[${requestId}] User missing host profile`, { userId: user._id });
      throw new ApiError(403, {
        message: "Please complete your host profile first",
        steps: ["1. Go to your profile settings", "2. Click on 'Become a Host'", "3. Fill out the host profile form", "4. Submit and verify your host profile"]
      });
    }

    // Verify host exists
    const host = await Host.findById(user.hostProfile);
    if (!host) {
      logger.error(`[${requestId}] Host profile not found but reference exists`, {
        userId: user._id,
        hostProfileId: user.hostProfile
      });
      await User.findByIdAndUpdate(userId, { $unset: { hostProfile: 1 } });
      throw new ApiError(404, "Host profile not found. Please recreate your host profile.");
    }

    logger.debug(`[${requestId}] Host profile verified`, { hostId: host._id });

    // Find the appropriate service
    const service = await Service.findOne({
      host: host._id,
      type: { $in: ["hotel", "lodge", "home_stay", "luxury_villa"] }
    });

    if (!service) {
      logger.warn(`[${requestId}] No valid service found for host`, { hostId: host._id });
      throw new ApiError(403, {
        message: "Please create a hotel or lodge service first",
        steps: ["1. Go to the 'Services' section", "2. Click on 'Add New Service'", "3. Select 'Hotel' or 'Lodge' as service type", "4. Fill out the required details", "5. Submit the form to create your service"]
      });
    }

    logger.debug(`[${requestId}] Service found for room creation`, {
      serviceId: service._id,
      serviceType: service.type
    });

    // Create the room object
    const room = new Room({
      service: service._id,
      name,
      roomType,
      pricePerNight,
      capacity,
      amenities: amenities || [],
      isAvailable: isAvailable !== undefined ? isAvailable : true,
      openingHours: openingHours || []
    });

    const savedRoom = await room.save();
    
    logger.info(`[${requestId}] Room created successfully`, {
      roomId: savedRoom._id,
      serviceId: savedRoom.service,
      duration: `${Date.now() - startTime}ms`
    });

    res.status(201).json(new ApiResponse(201, savedRoom, "Room created successfully."));
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.name) {
      logger.warn(`[${requestId}] Duplicate room name`, { 
        name: req.body.name,
        error: error.message 
      });
      throw new ApiError(400, "A room with this name already exists.");
    }
    
    logger.error(`[${requestId}] Room creation failed`, {
      error: error.message,
      stack: error.stack,
      duration: `${Date.now() - startTime}ms`
    });
    
    throw error;
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