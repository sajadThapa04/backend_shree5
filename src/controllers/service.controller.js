import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {Service} from "../models/services.model.js";
import {Host} from "../models/host.model.js";
import geocodeCoordinates from "../utils/geoCordinates.js";
import logger from "../utils/logger.js";
import mongoose from "mongoose";

/**
 * Create a new service for a host
 */
const createService = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      name, type,
      /* capacity, amenities, */
      coordinates
    } = req.body;

    const userId = req.user
      ?._id;
    logger.info(`Starting createService process for user: ${userId}`);

    // Step 1: Validate input fields
    if (!name || !type/* || !capacity */
    || !coordinates) {
      logger.error("Missing required fields");
      throw new ApiError(400, "All required fields must be provided");
    }

    // Validate service type
    const allowedServiceTypes = [
      "restaurant",
      "hotel",
      "lodge",
      "home_stay",
      "luxury_villa",
      "other"
    ];
    if (!allowedServiceTypes.includes(type)) {
      logger.error(`Invalid service type: ${type}`);
      throw new ApiError(400, `Invalid service type. Allowed types: ${allowedServiceTypes.join(", ")}`);
    }

    /*
                                    // Validate capacity
                                    if (capacity <= 0) {
                                      logger.error(`Invalid capacity: ${capacity}`);
                                      throw new ApiError(400, "Capacity must be a positive number");
                                    }
                                    */

    // Validate coordinates
    if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(coord => typeof coord === "number")) {
      logger.error("Invalid coordinates format");
      throw new ApiError(400, "Coordinates must be an array of [longitude, latitude]");
    }

    const [longitude, latitude] = coordinates;
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      logger.error("Invalid coordinates values");
      throw new ApiError(400, "Invalid coordinates. Longitude must be between -180 and 180, and latitude must be between -90 and 90");
    }

    // Step 2: Geocode coordinates to get address details
    const geocodedAddress = await geocodeCoordinates(coordinates);
    if (!geocodedAddress) {
      logger.error("Failed to geocode coordinates");
      throw new ApiError(500, "Failed to geocode coordinates");
    }

    // Step 3: Find the host associated with the authenticated user
    const host = await Host.findOne({user: userId}).session(session);
    if (!host) {
      logger.error(`Host not found for user ID: ${userId}`);
      throw new ApiError(404, "Host not found. Please create a host profile first.");
    }

    // Step 3: Check if the user already has a listing with the same coordinates
    const existingListing = await Service.findOne({"address.coordinates.coordinates": coordinates}).session(session);
    if (existingListing) {
      logger.error("User already has a listing at this address");
      throw new ApiError(400, "You already have a listing at this address");
    }

    // Step 4: Ownership verification
    if (host.user.toString() !== userId.toString()) {
      logger.error(`User ${userId} is not authorized to create a service for host ${host._id}`);
      throw new ApiError(403, "You are not authorized to create a service for this host.");
    }

    // Step 5: Create the service with address details
    const service = await Service.create([
      {
        host: host._id,
        name,
        type,
        // capacity,
        // amenities: Array.isArray(amenities) ? amenities : [amenities],
        address: {
          country: geocodedAddress.country,
          city: geocodedAddress.city,
          street: geocodedAddress.street,
          zipCode: geocodedAddress.zipCode,
          coordinates: {
            type: "Point",
            coordinates: coordinates
          }
        }
        // images: [] - Removed as per request
      }
    ], {session});

    await session.commitTransaction();
    session.endSession();

    logger.info(`Service created successfully for host: ${host._id}`);
    res.status(201).json(new ApiResponse(201, service[0], "Service created successfully"));
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    logger.error(`Error in createService: ${error.message}`, {stack: error.stack});

    if (error instanceof ApiError) 
      throw error;
    if (error.name === "ValidationError") 
      throw new ApiError(400, error.message);
    if (error.code === 11000) 
      throw new ApiError(400, "Duplicate field value entered");
    throw new ApiError(500, error.message || "Failed to create service");
  }
});

/**
 * Update a service
 */
const updateService = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {id} = req.params;
    const {
      name, type,
      /* capacity, amenities, */
      coordinates
    } = req.body;
    const userId = req.user._id;

    logger.info(`Starting updateService process for service ID: ${id}`);

    // Step 1: Validate input
    if (!id) {
      logger.error("Service ID is required");
      throw new ApiError(400, "Service ID is required");
    }

    // Validate service type if provided
    if (type) {
      const allowedServiceTypes = [
        "restaurant",
        "hotel",
        "lodge",
        "home_stay",
        "luxury_villa",
        "other"
      ];
      if (!allowedServiceTypes.includes(type)) {
        logger.error(`Invalid service type: ${type}`);
        throw new ApiError(400, `Invalid service type. Allowed types: ${allowedServiceTypes.join(", ")}`);
      }
    }

    /*
                                    // Validate capacity if provided
                                    if (capacity && capacity <= 0) {
                                      logger.error(`Invalid capacity: ${capacity}`);
                                      throw new ApiError(400, "Capacity must be a positive number");
                                    }
                                    */

    // Validate coordinates if provided
    let geocodedAddress = null;
    if (coordinates) {
      if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(coord => typeof coord === "number")) {
        logger.error("Invalid coordinates format");
        throw new ApiError(400, "Coordinates must be an array of [longitude, latitude]");
      }

      const [longitude, latitude] = coordinates;
      if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        logger.error("Invalid coordinates values");
        throw new ApiError(400, "Invalid coordinates. Longitude must be between -180 and 180, and latitude must be between -90 and 90");
      }

      geocodedAddress = await geocodeCoordinates(coordinates);
      if (!geocodedAddress) {
        logger.error("Failed to geocode coordinates");
        throw new ApiError(500, "Failed to geocode coordinates");
      }
    }

    // Step 2: Find and verify service
    const service = await Service.findById(id).session(session);
    if (!service) {
      logger.error(`Service not found with ID: ${id}`);
      throw new ApiError(404, "Service not found");
    }

    const host = await Host.findById(service.host).session(session);
    if (!host) {
      logger.error(`Host not found for service ID: ${id}`);
      throw new ApiError(404, "Host not found");
    }

    if (host.user.toString() !== userId.toString()) {
      logger.error(`User ${userId} is not authorized to update service ID: ${id}`);
      throw new ApiError(403, "You are not authorized to update this service");
    }

    // Step 3: Build update object
    const updateData = {};
    if (name) 
      updateData.name = name;
    if (type) 
      updateData.type = type;
    
    /*
                                    if (capacity)
                                      updateData.capacity = capacity;
                                    if (amenities)
                                      updateData.amenities = Array.isArray(amenities) ? amenities : [amenities];
                                    */

    if (coordinates && geocodedAddress) {
      updateData["address.coordinates"] = {
        type: "Point",
        coordinates: coordinates
      };
      updateData["address.country"] = geocodedAddress.country;
      updateData["address.city"] = geocodedAddress.city;
      updateData["address.street"] = geocodedAddress.street;
      updateData["address.zipCode"] = geocodedAddress.zipCode;
    }

    // Step 4: Update service
    const updatedService = await Service.findByIdAndUpdate(id, {
      $set: updateData
    }, {
      new: true,
      runValidators: true,
      session
    });

    if (!updatedService) {
      logger.error("Failed to update service");
      throw new ApiError(500, "Failed to update service");
    }

    await session.commitTransaction();
    session.endSession();

    logger.info(`Service updated successfully for service ID: ${id}`);
    res.status(200).json(new ApiResponse(200, updatedService, "Service updated successfully"));
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    logger.error(`Error in updateService: ${error.message}`, {stack: error.stack});

    if (error instanceof ApiError) 
      throw error;
    if (error.name === "CastError") 
      throw new ApiError(400, "Invalid service ID");
    if (error.name === "ValidationError") 
      throw new ApiError(400, error.message);
    if (error.code === 11000) 
      throw new ApiError(400, "Duplicate field value entered");
    throw new ApiError(500, error.message || "Failed to update service");
  }
});

/**
 * Delete a service
 */
const deleteService = asyncHandler(async (req, res) => {
  const {id} = req.params; // Service ID
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting deleteService process for service ID: ${id}`);

  // Step 1: Validate the service ID
  if (!id) {
    logger.error("Service ID is required");
    throw new ApiError(400, "Service ID is required");
  }

  // Step 2: Find the service to delete
  const service = await Service.findById(id);
  if (!service) {
    logger.error(`Service not found with ID: ${id}`);
    throw new ApiError(404, "Service not found");
  }

  // Step 3: Check if the authenticated user is the owner of the service
  const host = await Host.findById(service.host);
  if (!host) {
    logger.error(`Host not found for service ID: ${id}`);
    throw new ApiError(404, "Host not found");
  }

  if (host.user.toString() !== user.toString()) {
    logger.error(`User ${user} is not authorized to update service ID: ${id}`);
    throw new ApiError(403, "You are not authorized to update this service");
  }

  /*
                  // Step 3: Delete images from Cloudinary (if any)
                  if (service.images && service.images.length > 0) {
                    for (const imageUrl of service.images) {
                      const publicId = imageUrl.split("/").pop().split(".")[0]; // Extract public ID from URL
                      await deleteFromCloudinary(publicId); // Delete the image from Cloudinary
                    }
                  }
                  */

  // Step 4: Delete the service
  await Service.findByIdAndDelete(id);

  logger.info(`Service deleted successfully for service ID: ${id}`);

  // Step 5: Return success response
  res.status(200).json(new ApiResponse(200, {}, "Service deleted successfully"));
});

/**
 * Fetch all services for a specific host
 */
const getServicesForHost = asyncHandler(async (req, res) => {
  const {hostId} = req.params; // Host ID

  logger.info(`Starting getServicesForHost process for host ID: ${hostId}`);

  // Step 1: Validate host ID
  if (!hostId) {
    logger.error("Host ID is required");
    throw new ApiError(400, "Host ID is required");
  }

  // Step 2: Check if the host exists
  const host = await Host.findById(hostId);
  if (!host) {
    logger.error(`Host not found with ID: ${hostId}`);
    throw new ApiError(404, "Host not found");
  }

  // Step 3: Fetch all services for the host
  const services = await Service.find({host: hostId});

  // If no services are found, return an empty array
  if (!services || services.length === 0) {
    logger.info(`No services found for host ID: ${hostId}`);
    return res.status(200).json(new ApiResponse(200, {
      services: []
    }, "No services found"));
  }

  logger.info(`Fetched ${services.length} services for host ID: ${hostId}`);

  // Step 4: Return the services
  res.status(200).json(new ApiResponse(200, {
    services
  }, "Services fetched successfully"));
});

/**
 * Get service names (public access)
 */
const getServiceNames = asyncHandler(async (req, res) => {
  try {
    logger.info("Fetching all service names");

    // Fetch only the name, _id, and type fields for all services
    // Note: Currently fetching all services regardless of status for testing
    // In future, you can uncomment the status filter below
    const services = await Service.find(
    // { status: "active" },  Filter only active services (commented for now)
    {}, { // Empty filter to get all services
      name: 1,
      type: 1,
      _id: 1,
      status: 1 // Including status in response for debugging
    }).lean();

    logger.info(`Fetched ${services.length} service names`);

    // Format response to match your expected structure
    res.status(200).json({
      statusCode: 200, data: services, // This will be an array of service objects
      message: "Service names fetched successfully",
      success: true
    });
  } catch (error) {
    logger.error(`Error in getServiceNames: ${error.message}`, {stack: error.stack});
    // Return error in the same format
    res.status(500).json({
      statusCode: 500,
      data: null,
      message: error.message || "Failed to fetch service names",
      success: false
    });
  }
});
/*
 * Commented out image-related methods as per request
 *

const uploadServiceImages = asyncHandler(async (req, res) => {
  const {id} = req.params; // Service ID
  const files = req.files; // Array of uploaded files
  const userId = req.user._id; // Authenticated user's ID

  logger.info(`Starting uploadServiceImages process for service ID: ${id}`);

  // Step 1: Validate the service ID
  if (!id) {
    logger.error("Service ID is required");
    throw new ApiError(400, "Service ID is required");
  }

  // Step 2: Check if files were uploaded
  if (!files || files.length === 0) {
    logger.error("No images uploaded");
    throw new ApiError(400, "No images uploaded");
  }

  // Step 3: Fetch the service document
  const service = await Service.findById(id);
  if (!service) {
    logger.error(`Service not found with ID: ${id}`);
    throw new ApiError(404, "Service not found");
  }

  // Step 4: Check if the authenticated user is the owner of the service
  const host = await Host.findById(service.host);
  if (!host) {
    logger.error(`Host not found for service ID: ${id}`);
    throw new ApiError(404, "Host not found");
  }

  if (host.user.toString() !== userId.toString()) {
    logger.error(`User ${userId} is not authorized to upload images for service ID: ${id}`);
    throw new ApiError(403, "You are not authorized to upload images for this service");
  }

  // Step 5: Upload images to Cloudinary and get their URLs
  const imageUrls = await Promise.all(files.map(async file => {
    const localFilePath = file.path; // Temporary file path

    // Upload the image to Cloudinary
    const cloudinaryResponse = await uploadOnCloudinary(localFilePath);

    // If the upload fails, throw an error
    if (!cloudinaryResponse || !cloudinaryResponse.secure_url) {
      logger.error("Failed to upload image to Cloudinary");
      throw new ApiError(500, "Failed to upload image to Cloudinary");
    }

    // Return the secure URL of the uploaded image
    return cloudinaryResponse.secure_url;
  }));

  // Step 6: Update the service with new image URLs
  const updatedService = await Service.findByIdAndUpdate(id, {
    $push: {
      images: {
        $each: imageUrls // Append new image URLs to the existing ones
      }
    }
  }, {
    new: true // Return the updated document
  });

  if (!updatedService) {
    logger.error("Failed to update service with new images");
    throw new ApiError(500, "Failed to update service with new images");
  }

  logger.info(`Images uploaded successfully for service ID: ${id}`);

  // Step 7: Return the updated service
  res.status(200).json(new ApiResponse(200, updatedService, "Images uploaded successfully"));
});

const updateServiceImages = asyncHandler(async (req, res) => {
  try {
    logger.info("Starting updateServiceImages process");

    // Extract service ID from request parameters
    const id = req.params.id;

    // Extract uploaded files and authenticated user's ID
    const files = req.files; // Array of uploaded files
    const userId = req.user._id; // Authenticated user's ID

    // Step 1: Validate the service ID
    if (!id) {
      logger.error("Service ID is required");
      throw new ApiError(400, "Service ID is required");
    }

    // Step 2: Check if files were uploaded
    if (!files || files.length === 0) {
      logger.error("No images uploaded");
      throw new ApiError(400, "No images uploaded");
    }

    // Step 3: Fetch the existing service document
    const service = await Service.findById(id);

    // If the service is not found, throw a 404 error
    if (!service) {
      logger.error("Service not found");
      throw new ApiError(404, "Service not found");
    }

    // Step 4: Check if the authenticated user is the owner of the service
    const host = await Host.findById(service.host);
    if (!host) {
      logger.error(`Host not found for service ID: ${id}`);
      throw new ApiError(404, "Host not found");
    }

    if (host.user.toString() !== userId.toString()) {
      logger.error(`User ${userId} is not authorized to update images for service ID: ${id}`);
      throw new ApiError(403, "You are not authorized to update images for this service");
    }

    // Step 5: Delete existing images from Cloudinary
    if (service.images && service.images.length > 0) {
      await Promise.all(service.images.map(async imageUrl => {
        const publicId = imageUrl.split("/").pop().split(".")[0]; // Extract public ID from URL
        await deleteFromCloudinary(publicId); // Delete the image from Cloudinary
      }));
    }

    // Step 6: Upload new images to Cloudinary and get their URLs
    const imageUrls = await Promise.all(files.map(async file => {
      const localFilePath = file.path; // Temporary file path

      // Upload the image to Cloudinary
      const cloudinaryResponse = await uploadOnCloudinary(localFilePath);

      // If the upload fails, throw an error
      if (!cloudinaryResponse || !cloudinaryResponse.secure_url) {
        logger.error("Failed to upload image to Cloudinary");
        throw new ApiError(500, "Failed to upload image to Cloudinary");
      }

      // Return the secure URL of the uploaded image
      return cloudinaryResponse.secure_url;
    }));

    // Step 7: Update the service document with the new image URLs (replace existing images)
    const updatedService = await Service.findByIdAndUpdate(id, {
      $set: {
        images: imageUrls // Replace the `images` array with the new URLs
      }
    }, {
      new: true // Return the updated document
    });

    logger.info("Service images updated successfully");

    // Step 8: Return the updated service data
    res.status(200).json(new ApiResponse(200, updatedService, "Service images updated successfully"));
  } catch (error) {
    logger.error(`Error in updateServiceImages: ${error.message}`, {stack: error.stack});
    throw new ApiError(500, error.message || "Failed to update service images");
  }
});
*/

export {
  createService,
  updateService,
  deleteService,
  getServicesForHost,
  getServiceNames
  // uploadServiceImages, - Commented out
  // updateServiceImages - Commented out
};