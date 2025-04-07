import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {Restaurant} from "../models/restaurant.model.js";
import {Service} from "../models/services.model.js";
import {Host} from "../models/host.model.js";
import logger from "../utils/logger.js";
import {uploadOnCloudinary, deleteFromCloudinary} from "../utils/cloudinary.js";
import mongoose from "mongoose";

// Create a new restaurant
const createRestaurant = asyncHandler(async (req, res) => {
  try {
    // Destructure and validate input data
    const {
      service,
      name,
      cuisineType,
      pricePerMeal,
      seatingCapacity,
      openingHours,
      amenities,
      isAvailable
    } = req.body;

    // Log the incoming request body for debugging
    logger.info("Incoming request body:", req.body);

    // Check for required fields
    if (!service || !name || !cuisineType || !pricePerMeal || !seatingCapacity || !openingHours) {
      logger.error("Missing required fields in request body.");
      throw new ApiError(400, "All required fields must be provided.");
    }

    // Validate pricePerMeal
    if (pricePerMeal < 0) {
      logger.error(`Invalid price per meal provided: ${pricePerMeal}`);
      throw new ApiError(400, "Price per meal cannot be negative.");
    }

    // Validate seatingCapacity
    if (seatingCapacity < 1) {
      logger.error(`Invalid seating capacity provided: ${seatingCapacity}`);
      throw new ApiError(400, "Seating capacity must be at least 1.");
    }

    // Validate openingHours structure
    const days = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday"
    ];
    for (const day of days) {
      if (!openingHours[day] || !openingHours[day].openingTime || !openingHours[day].closingTime) {
        logger.error(`Missing opening or closing time for ${day}.`);
        throw new ApiError(400, `Opening and closing times for ${day} are required.`);
      }

      // Validate time format (HH:mm)
      const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(openingHours[day].openingTime) || !timeRegex.test(openingHours[day].closingTime)) {
        logger.error(`Invalid time format for ${day}.`);
        throw new ApiError(400, `Times for ${day} must be in HH:mm format.`);
      }
    }

    // Check if the service exists
    const existingService = await Service.findById(service);
    if (!existingService) {
      logger.error(`Service not found with ID: ${service}`);
      throw new ApiError(404, "Service not found.");
    }

    // Check if the authenticated user is authorized to create the restaurant
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
      logger.error(`User ${userId} is not authorized to create a restaurant for service ${service}`);
      throw new ApiError(403, "You are not authorized to create a restaurant for this service.");
    }

    // Create the restaurant object
    const restaurant = new Restaurant({
      service,
      name,
      cuisineType,
      pricePerMeal,
      seatingCapacity,
      openingHours,
      amenities: amenities || [], // Default to an empty array if not provided
      isAvailable: isAvailable !== undefined
        ? isAvailable
        : true // Default to true if not provided
    });

    // Save the restaurant to the database
    const savedRestaurant = await restaurant.save();
    if (!savedRestaurant) {
      logger.error("Failed to save the restaurant to the database.");
      throw new ApiError(500, "Failed to save the restaurant to the database.");
    }

    // Log the successful creation of the restaurant
    logger.info(`Restaurant created successfully with ID: ${savedRestaurant._id}`);

    // Return the created restaurant
    res.status(201).json(new ApiResponse(201, savedRestaurant, "Restaurant created successfully."));
  } catch (error) {
    // Handle duplicate key error for restaurant name
    if (
      error.code === 11000 && error.keyPattern
      ?.name) {
      throw new ApiError(400, "A restaurant with this name already exists.");
    }
    throw error; // Re-throw other errors
  }
});

// Get all restaurants
const getAllRestaurants = asyncHandler(async (req, res) => {
  try {
    // Step 1: Extract query parameters for filtering, sorting, and pagination
    const {
      service, // Filter by service ID
      cuisineType, // Filter by cuisine type
      minPricePerMeal, // Filter by minimum price per meal
      maxPricePerMeal, // Filter by maximum price per meal
      isAvailable, // Filter by availability
      sortBy, // Sort by field (e.g., pricePerMeal, seatingCapacity)
      sortOrder, // Sort order (asc or desc)
      page = 1, // Page number for pagination (default: 1)
      limit = 10 // Number of items per page (default: 10)
    } = req.query;

    // Step 2: Build the filter object
    const filter = {};

    if (service) {
      filter.service = service;
    }

    if (cuisineType) {
      filter.cuisineType = {
        $in: cuisineType.split(",")
      }; // Allow multiple cuisine types
    }

    if (minPricePerMeal || maxPricePerMeal) {
      filter.pricePerMeal = {};
      if (minPricePerMeal) {
        filter.pricePerMeal.$gte = parseFloat(minPricePerMeal);
      }
      if (maxPricePerMeal) {
        filter.pricePerMeal.$lte = parseFloat(maxPricePerMeal);
      }
    }

    if (isAvailable !== undefined) {
      filter.isAvailable = isAvailable === "true";
    }

    // Step 3: Build the sort object
    const sort = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === "desc"
        ? -1
        : 1; // Default to ascending order
    }

    // Step 4: Calculate pagination values
    const skip = (page - 1) * limit;

    // Step 5: Fetch restaurants from the database
    const restaurants = await Restaurant.find(filter).sort(sort).skip(skip).limit(limit).populate("service", "name type"); // Populate the service reference

    // Step 6: Count total restaurants for pagination
    const totalRestaurants = await Restaurant.countDocuments(filter);

    // Step 7: Return the response
    res.status(200).json(new ApiResponse(200, {
      restaurants,
      page: parseInt(page),
      limit: parseInt(limit),
      total: totalRestaurants,
      totalPages: Math.ceil(totalRestaurants / limit)
    }, "Restaurants fetched successfully."));
  } catch (error) {
    logger.error(`Error fetching restaurants: ${error.message}`);
    throw new ApiError(500, "Failed to fetch restaurants.");
  }
});

// Get a restaurant by ID
const getRestaurantById = asyncHandler(async (req, res) => {
  try {
    const {id} = req.params; // Restaurant ID from URL params

    // Step 1: Validate the restaurant ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.error(`Invalid restaurant ID: ${id}`);
      throw new ApiError(400, "Invalid restaurant ID.");
    }

    // Step 2: Fetch the restaurant from the database
    const restaurant = await Restaurant.findById(id).populate("service", "name type"); // Populate the service reference

    // Step 3: Check if the restaurant exists
    if (!restaurant) {
      logger.error(`Restaurant not found with ID: ${id}`);
      throw new ApiError(404, "Restaurant not found.");
    }

    // Step 4: Return the restaurant details
    res.status(200).json(new ApiResponse(200, restaurant, "Restaurant fetched successfully."));
  } catch (error) {
    logger.error(`Error fetching restaurant by ID: ${error.message}`);
    throw new ApiError(500, "Failed to fetch restaurant.");
  }
});

// Get restaurants by service ID
const getRestaurantsByService = asyncHandler(async (req, res) => {
  try {
    const {serviceId} = req.params; // Service ID from URL params

    // Step 1: Validate the service ID
    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      logger.error(`Invalid service ID: ${serviceId}`);
      throw new ApiError(400, "Invalid service ID.");
    }

    // Step 2: Check if the service exists
    const service = await Service.findById(serviceId);
    if (!service) {
      logger.error(`Service not found with ID: ${serviceId}`);
      throw new ApiError(404, "Service not found.");
    }

    // Step 3: Fetch restaurants associated with the service
    const restaurants = await Restaurant.find({service: serviceId}).populate("service", "name type"); // Populate the service reference

    // Step 4: Return the list of restaurants
    res.status(200).json(new ApiResponse(200, restaurants, "Restaurants fetched successfully."));
  } catch (error) {
    logger.error(`Error fetching restaurants by service ID: ${error.message}`);
    throw new ApiError(500, "Failed to fetch restaurants.");
  }
});

// Update a restaurant
const updateRestaurant = asyncHandler(async (req, res) => {
  try {
    const {id} = req.params; // Restaurant ID from URL params
    const userId = req.user._id; // Authenticated user's ID
    const updateData = req.body; // Data to update

    logger.info(`Starting updateRestaurant process for restaurant ID: ${id} by user ID: ${userId}`);

    // Step 1: Validate the restaurant ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.error(`Invalid restaurant ID: ${id}`);
      throw new ApiError(400, "Invalid restaurant ID.");
    }

    // Step 2: Fetch the restaurant from the database
    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      logger.error(`Restaurant not found with ID: ${id}`);
      throw new ApiError(404, "Restaurant not found.");
    }

    // Step 3: Fetch the service associated with the restaurant
    const service = await Service.findById(restaurant.service);
    if (!service) {
      logger.error(`Service not found for restaurant ID: ${id}`);
      throw new ApiError(404, "Service not found.");
    }

    // Step 4: Fetch the host associated with the service
    const host = await Host.findById(service.host);
    if (!host) {
      logger.error(`Host not found for service ID: ${service._id}`);
      throw new ApiError(404, "Host not found.");
    }

    // Step 5: Check if the authenticated user is authorized to update the restaurant
    if (host.user.toString() !== userId.toString()) {
      logger.error(`User ${userId} is not authorized to update restaurant ${id}`);
      throw new ApiError(403, "You are not authorized to update this restaurant.");
    }

    // Step 6: Validate update data (optional, based on your requirements)
    if (updateData.pricePerMeal && updateData.pricePerMeal < 0) {
      logger.error(`Invalid price per meal provided: ${updateData.pricePerMeal}`);
      throw new ApiError(400, "Price per meal cannot be negative.");
    }

    if (updateData.seatingCapacity && updateData.seatingCapacity < 1) {
      logger.error(`Invalid seating capacity provided: ${updateData.seatingCapacity}`);
      throw new ApiError(400, "Seating capacity must be at least 1.");
    }

    if (updateData.openingHours) {
      const days = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday"
      ];
      for (const day of days) {
        // Only validate and update if the day is provided in the update data
        if (updateData.openingHours[day]) {
          if (!updateData.openingHours[day].openingTime || !updateData.openingHours[day].closingTime) {
            logger.error(`Missing opening or closing time for ${day}.`);
            throw new ApiError(400, `Opening and closing times for ${day} are required.`);
          }

          // Validate time format (HH:mm)
          const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(updateData.openingHours[day].openingTime) || !timeRegex.test(updateData.openingHours[day].closingTime)) {
            logger.error(`Invalid time format for ${day}.`);
            throw new ApiError(400, `Times for ${day} must be in HH:mm format.`);
          }

          // Update the specific day's opening hours
          restaurant.openingHours[day] = updateData.openingHours[day];
        }
      }
    }

    // Step 7: Update other fields (if provided)
    if (updateData.name) 
      restaurant.name = updateData.name;
    if (updateData.cuisineType) 
      restaurant.cuisineType = updateData.cuisineType;
    if (updateData.pricePerMeal) 
      restaurant.pricePerMeal = updateData.pricePerMeal;
    if (updateData.seatingCapacity) 
      restaurant.seatingCapacity = updateData.seatingCapacity;
    if (updateData.amenities) 
      restaurant.amenities = updateData.amenities;
    if (updateData.isAvailable !== undefined) 
      restaurant.isAvailable = updateData.isAvailable;
    
    // Step 8: Save the updated restaurant
    const updatedRestaurant = await restaurant.save();

    if (!updatedRestaurant) {
      logger.error(`Failed to update restaurant with ID: ${id}`);
      throw new ApiError(500, "Failed to update the restaurant.");
    }

    // Step 9: Log the successful update
    logger.info(`Restaurant updated successfully with ID: ${id}`);

    // Step 10: Return the updated restaurant
    res.status(200).json(new ApiResponse(200, updatedRestaurant, "Restaurant updated successfully."));
  } catch (error) {
    logger.error(`Error updating restaurant: ${error.message}`);
    throw new ApiError(500, "Failed to update the restaurant.");
  }
});

// Delete a restaurant
const deleteRestaurant = asyncHandler(async (req, res) => {
  try {
    const {id} = req.params; // Restaurant ID from URL params
    const userId = req.user._id; // Authenticated user's ID

    logger.info(`Starting deleteRestaurant process for restaurant ID: ${id} by user ID: ${userId}`);

    // Step 1: Validate the restaurant ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.error(`Invalid restaurant ID: ${id}`);
      throw new ApiError(400, "Invalid restaurant ID.");
    }

    // Step 2: Fetch the restaurant from the database
    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      logger.error(`Restaurant not found with ID: ${id}`);
      throw new ApiError(404, "Restaurant not found.");
    }

    // Step 3: Fetch the service associated with the restaurant
    const service = await Service.findById(restaurant.service);
    if (!service) {
      logger.error(`Service not found for restaurant ID: ${id}`);
      throw new ApiError(404, "Service not found.");
    }

    // Step 4: Fetch the host associated with the service
    const host = await Host.findById(service.host);
    if (!host) {
      logger.error(`Host not found for service ID: ${service._id}`);
      throw new ApiError(404, "Host not found.");
    }

    // Step 5: Check if the authenticated user is authorized to delete the restaurant
    if (host.user.toString() !== userId.toString()) {
      logger.error(`User ${userId} is not authorized to delete restaurant ${id}`);
      throw new ApiError(403, "You are not authorized to delete this restaurant.");
    }

    // Step 6: Delete associated images from Cloudinary
    if (restaurant.images && restaurant.images.length > 0) {
      for (const imageUrl of restaurant.images) {
        try {
          await deleteFromCloudinary(imageUrl);
          logger.info(`Deleted image from Cloudinary: ${imageUrl}`);
        } catch (error) {
          logger.error(`Failed to delete image from Cloudinary: ${imageUrl}`, error);
          throw new ApiError(500, "Failed to delete images from Cloudinary.");
        }
      }
    }

    // Step 7: Delete the restaurant from the database
    const deletedRestaurant = await Restaurant.findByIdAndDelete(id);
    if (!deletedRestaurant) {
      logger.error(`Failed to delete restaurant with ID: ${id}`);
      throw new ApiError(500, "Failed to delete the restaurant.");
    }

    // Step 8: Log the successful deletion
    logger.info(`Restaurant deleted successfully with ID: ${id}`);

    // Step 9: Return a success message
    res.status(200).json(new ApiResponse(200, null, "Restaurant deleted successfully."));
  } catch (error) {
    logger.error(`Error deleting restaurant: ${error.message}`);
    throw new ApiError(500, "Failed to delete the restaurant.");
  }
});

// Upload images for a restaurant
const uploadRestaurantImages = asyncHandler(async (req, res) => {
  // TODO: Implement logic to upload restaurant images
  // - Validate the restaurant ID
  // - Check if the authenticated user is authorized
  // - Upload images to Cloudinary
  // - Update the restaurant document with the new image URLs
  // - Return the updated restaurant
});

// Update images for a restaurant
const updateRestaurantImages = asyncHandler(async (req, res) => {
  try {
    const {id} = req.params; // Restaurant ID from URL params
    const userId = req.user._id; // Authenticated user's ID
    const files = req.files; // Uploaded images from multer

    logger.info(`Starting updateRestaurantImages process for restaurant ID: ${id} by user ID: ${userId}`);

    // Step 1: Validate the restaurant ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.error(`Invalid restaurant ID: ${id}`);
      throw new ApiError(400, "Invalid restaurant ID.");
    }

    // Step 2: Fetch the restaurant from the database
    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      logger.error(`Restaurant not found with ID: ${id}`);
      throw new ApiError(404, "Restaurant not found.");
    }

    // Step 3: Fetch the service associated with the restaurant
    const service = await Service.findById(restaurant.service);
    if (!service) {
      logger.error(`Service not found for restaurant ID: ${id}`);
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
      logger.error(`User ${userId} is not authorized to update images for restaurant ${id}`);
      throw new ApiError(403, "You are not authorized to update images for this restaurant.");
    }

    // Step 6: Check if images were uploaded
    if (!files || files.length === 0) {
      logger.error("No images were uploaded.");
      throw new ApiError(400, "No images were uploaded.");
    }

    // Step 7: Delete old images from Cloudinary
    if (restaurant.images && restaurant.images.length > 0) {
      for (const imageUrl of restaurant.images) {
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

    // Step 9: Update the restaurant document with the new image URLs
    restaurant.images = newImageUrls; // Replace old images with new ones
    const updatedRestaurant = await restaurant.save();

    if (!updatedRestaurant) {
      logger.error(`Failed to update restaurant with ID: ${id}`);
      throw new ApiError(500, "Failed to update the restaurant with new images.");
    }

    // Step 10: Return the updated restaurant
    logger.info(`Restaurant images updated successfully for restaurant ID: ${id}`);
    res.status(200).json(new ApiResponse(200, updatedRestaurant, "Restaurant images updated successfully."));
  } catch (error) {
    logger.error(`Error updating restaurant images: ${error.message}`);
    throw new ApiError(500, "Failed to update restaurant images.");
  }
});

export {
  createRestaurant,
  getAllRestaurants,
  getRestaurantById,
  getRestaurantsByService,
  updateRestaurant,
  deleteRestaurant,
  uploadRestaurantImages,
  updateRestaurantImages
};