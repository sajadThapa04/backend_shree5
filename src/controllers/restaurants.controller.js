import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {Restaurant} from "../models/restaurant.model.js";
import {Service} from "../models/services.model.js";
import {Host} from "../models/host.model.js";
import logger from "../utils/logger.js";
import {User} from "../models/user.model.js";
import {uploadOnCloudinary, deleteFromCloudinary} from "../utils/cloudinary.js";
import mongoose from "mongoose";

// Create a new restaurant
const createRestaurant = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const requestId = req.requestId || mongoose.Types.ObjectId().toString();

  try {
    logger.info(`[${requestId}] Starting restaurant creation process`, {
      action: "createRestaurant",
      userId: req.user
        ?._id,
      body: req.body
    });

    const {cuisineDetails, seatingCapacity, openingHours, amenities, isAvailable} = req.body;

    // Validate required fields (removed name validation)
    if (!cuisineDetails || !seatingCapacity || !openingHours) {
      logger.warn(`[${requestId}] Missing required fields`, {
        missingFields: {
          cuisineDetails: !cuisineDetails,
          seatingCapacity: !seatingCapacity,
          openingHours: !openingHours
        }
      });
      throw new ApiError(400, "All required fields must be provided.");
    }

    // Validate cuisineDetails array (unchanged)
    if (!Array.isArray(cuisineDetails) || cuisineDetails.length === 0) {
      logger.warn(`[${requestId}] Invalid cuisine details`, {
        cuisineDetailsLength: cuisineDetails
          ?.length
      });
      throw new ApiError(400, "At least one cuisine detail is required.");
    }

    // Validate each cuisine detail (unchanged)
    for (const cuisine of cuisineDetails) {
      if (!cuisine.name || !cuisine.price) {
        logger.warn(`[${requestId}] Invalid cuisine item`, {cuisine});
        throw new ApiError(400, "Each cuisine must have a name and price.");
      }
      if (cuisine.price < 0) {
        logger.warn(`[${requestId}] Negative cuisine price`, {
          cuisineName: cuisine.name,
          price: cuisine.price
        });
        throw new ApiError(400, "Cuisine price cannot be negative.");
      }
      // Validate image URL if provided
      if (cuisine.image && !/^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))$/i.test(cuisine.image)) {
        throw new ApiError(400, "Cuisine image URL must be valid and end with png, jpg, jpeg, gif, or webp.");
      }
    }

    // Validate seatingCapacity (unchanged)
    if (seatingCapacity < 1) {
      logger.warn(`[${requestId}] Invalid seating capacity`, {seatingCapacity});
      throw new ApiError(400, "Seating capacity must be at least 1.");
    }

    // Validate openingHours array with timeSlots
    if (!Array.isArray(openingHours) || openingHours.length === 0) {
      logger.warn(`[${requestId}] Invalid opening hours`, {
        openingHoursLength: openingHours
          ?.length
      });
      throw new ApiError(400, "Opening hours are required for all days.");
    }

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
        logger.warn(`[${requestId}] Invalid day in opening hours`, {day});
        throw new ApiError(400, `Invalid day: ${day.day}`);
      }

      // Validate timeSlots array exists and has at least one slot
      if (!Array.isArray(day.timeSlots) || day.timeSlots.length === 0) {
        logger.warn(`[${requestId}] Missing time slots for day`, {day});
        throw new ApiError(400, `At least one time slot is required for ${day.day}`);
      }

      // Validate each time slot
      for (const slot of day.timeSlots) {
        if (!slot.openingTime || !slot.closingTime) {
          logger.warn(`[${requestId}] Missing opening/closing times in slot`, {slot});
          throw new ApiError(400, `Opening and closing times are required for each time slot on ${day.day}`);
        }

        const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(slot.openingTime) || !timeRegex.test(slot.closingTime)) {
          logger.warn(`[${requestId}] Invalid time format in slot`, {
            day: day.day,
            openingTime: slot.openingTime,
            closingTime: slot.closingTime
          });
          throw new ApiError(400, `Times for ${day.day} must be in HH:mm format.`);
        }
      }

      openingHoursMap[day.day] = day;
    }

    // Check all days are present
    for (const day of days) {
      if (!openingHoursMap[day]) {
        logger.warn(`[${requestId}] Missing opening hours for day`, {day});
        throw new ApiError(400, `Opening hours for ${day} are required.`);
      }
    }

    // [Rest of the user/host validation remains the same...]

    // Create the restaurant (removed name field)
    const restaurant = new Restaurant({
      service: service._id,
      cuisineDetails,
      seatingCapacity,
      openingHours,
      amenities: amenities || [],
      isAvailable: isAvailable !== undefined
        ? isAvailable
        : true
    });

    const savedRestaurant = await restaurant.save();

    logger.info(`[${requestId}] Restaurant created successfully`, {
      restaurantId: savedRestaurant._id,
      serviceId: savedRestaurant.service,
      duration: `${Date.now() - startTime}ms`
    });

    res.status(201).json(new ApiResponse(201, savedRestaurant, "Restaurant created successfully."));
  } catch (error) {
    // Removed duplicate name check since name field is removed
    logger.error(`[${requestId}] Restaurant creation failed`, {
      error: error.message,
      stack: error.stack,
      duration: `${Date.now() - startTime}ms`
    });
    throw error;
  }
});

// Get all restaurants
const getAllRestaurants = asyncHandler(async (req, res) => {
  try {
    // Extract query parameters
    const {
      service, cuisineName, // Changed from cuisineType to filter by cuisineDetails.name
      minPrice, // Filter by cuisineDetails.price
      maxPrice,
      isAvailable,
      sortBy,
      sortOrder,
      page = 1,
      limit = 10
    } = req.query;

    // Build the filter object
    const filter = {};

    if (service) {
      filter.service = service;
    }

    if (cuisineName) {
      filter["cuisineDetails.name"] = {
        $in: cuisineName.split(",")
      };
    }

    if (minPrice || maxPrice) {
      filter["cuisineDetails.price"] = {};
      if (minPrice) 
        filter["cuisineDetails.price"].$gte = parseFloat(minPrice);
      if (maxPrice) 
        filter["cuisineDetails.price"].$lte = parseFloat(maxPrice);
      }
    
    if (isAvailable !== undefined) {
      filter.isAvailable = isAvailable === "true";
    }

    // Build the sort object
    const sort = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === "desc"
        ? -1
        : 1;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Fetch restaurants with pagination
    const restaurants = await Restaurant.find(filter).sort(sort).skip(skip).limit(limit).populate("service", "name type");

    // Count total restaurants
    const totalRestaurants = await Restaurant.countDocuments(filter);

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
    const {id} = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.error(`Invalid restaurant ID: ${id}`);
      throw new ApiError(400, "Invalid restaurant ID.");
    }

    const restaurant = await Restaurant.findById(id).populate("service", "name type");
    if (!restaurant) {
      logger.error(`Restaurant not found with ID: ${id}`);
      throw new ApiError(404, "Restaurant not found.");
    }

    res.status(200).json(new ApiResponse(200, restaurant, "Restaurant fetched successfully."));
  } catch (error) {
    logger.error(`Error fetching restaurant by ID: ${error.message}`);
    throw new ApiError(500, "Failed to fetch restaurant.");
  }
});

// Get restaurants by service ID
const getRestaurantsByService = asyncHandler(async (req, res) => {
  try {
    const {serviceId} = req.params;

    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      logger.error(`Invalid service ID: ${serviceId}`);
      throw new ApiError(400, "Invalid service ID.");
    }

    const service = await Service.findById(serviceId);
    if (!service) {
      logger.error(`Service not found with ID: ${serviceId}`);
      throw new ApiError(404, "Service not found.");
    }

    const restaurants = await Restaurant.find({service: serviceId}).populate("service", "name type");
    res.status(200).json(new ApiResponse(200, restaurants, "Restaurants fetched successfully."));
  } catch (error) {
    logger.error(`Error fetching restaurants by service ID: ${error.message}`);
    throw new ApiError(500, "Failed to fetch restaurants.");
  }
});

// Update a restaurant
const updateRestaurant = asyncHandler(async (req, res) => {
  try {
    const {id} = req.params;
    const userId = req.user._id;
    const updateData = req.body;

    logger.info(`Starting updateRestaurant process for restaurant ID: ${id} by user ID: ${userId}`);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.error(`Invalid restaurant ID: ${id}`);
      throw new ApiError(400, "Invalid restaurant ID.");
    }

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      logger.error(`Restaurant not found with ID: ${id}`);
      throw new ApiError(404, "Restaurant not found.");
    }

    // [Rest of the service/host validation remains the same...]

    // Validate cuisineDetails if provided
    if (updateData.cuisineDetails) {
      if (!Array.isArray(updateData.cuisineDetails)) {
        throw new ApiError(400, "Cuisine details must be an array.");
      }

      for (const cuisine of updateData.cuisineDetails) {
        if (!cuisine.name || !cuisine.price) {
          throw new ApiError(400, "Each cuisine must have a name and price.");
        }
        if (cuisine.price < 0) {
          throw new ApiError(400, "Cuisine price cannot be negative.");
        }
        // Validate image URL if provided
        if (cuisine.image && !/^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))$/i.test(cuisine.image)) {
          throw new ApiError(400, "Cuisine image URL must be valid and end with png, jpg, jpeg, gif, or webp.");
        }
      }
      restaurant.cuisineDetails = updateData.cuisineDetails;
    }

    // Validate seatingCapacity if provided
    if (updateData.seatingCapacity && updateData.seatingCapacity < 1) {
      logger.error(`Invalid seating capacity provided: ${updateData.seatingCapacity}`);
      throw new ApiError(400, "Seating capacity must be at least 1.");
    }

    // Validate openingHours if provided
    if (updateData.openingHours) {
      if (!Array.isArray(updateData.openingHours)) {
        throw new ApiError(400, "Opening hours must be an array.");
      }

      const days = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday"
      ];

      for (const day of updateData.openingHours) {
        if (!days.includes(day.day)) {
          throw new ApiError(400, `Invalid day: ${day.day}`);
        }

        // Validate timeSlots array exists and has at least one slot
        if (!Array.isArray(day.timeSlots) || day.timeSlots.length === 0) {
          throw new ApiError(400, `At least one time slot is required for ${day.day}`);
        }

        // Validate each time slot
        for (const slot of day.timeSlots) {
          if (!slot.openingTime || !slot.closingTime) {
            throw new ApiError(400, `Opening and closing times are required for each time slot on ${day.day}`);
          }

          const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(slot.openingTime) || !timeRegex.test(slot.closingTime)) {
            throw new ApiError(400, `Times for ${day.day} must be in HH:mm format.`);
          }
        }

        // Find existing day or add new
        const existingDayIndex = restaurant.openingHours.findIndex(d => d.day === day.day);
        if (existingDayIndex >= 0) {
          // Update existing day's timeSlots
          restaurant.openingHours[existingDayIndex].timeSlots = day.timeSlots;
        } else {
          // Add new day with timeSlots
          restaurant.openingHours.push({day: day.day, timeSlots: day.timeSlots});
        }
      }
    }

    // Update other fields if provided (removed name update)
    if (updateData.amenities) 
      restaurant.amenities = updateData.amenities;
    if (updateData.seatingCapacity) 
      restaurant.seatingCapacity = updateData.seatingCapacity;
    if (updateData.isAvailable !== undefined) 
      restaurant.isAvailable = updateData.isAvailable;
    
    const updatedRestaurant = await restaurant.save();
    if (!updatedRestaurant) {
      logger.error(`Failed to update restaurant with ID: ${id}`);
      throw new ApiError(500, "Failed to update the restaurant.");
    }

    logger.info(`Restaurant updated successfully with ID: ${id}`);
    res.status(200).json(new ApiResponse(200, updatedRestaurant, "Restaurant updated successfully."));
  } catch (error) {
    logger.error(`Error updating restaurant: ${error.message}`);
    throw new ApiError(500, "Failed to update the restaurant.");
  }
});

// Delete a restaurant
const deleteRestaurant = asyncHandler(async (req, res) => {
  try {
    const {id} = req.params;
    const userId = req.user._id;

    logger.info(`Starting deleteRestaurant process for restaurant ID: ${id} by user ID: ${userId}`);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.error(`Invalid restaurant ID: ${id}`);
      throw new ApiError(400, "Invalid restaurant ID.");
    }

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      logger.error(`Restaurant not found with ID: ${id}`);
      throw new ApiError(404, "Restaurant not found.");
    }

    const service = await Service.findById(restaurant.service);
    if (!service) {
      logger.error(`Service not found for restaurant ID: ${id}`);
      throw new ApiError(404, "Service not found.");
    }

    const host = await Host.findById(service.host);
    if (!host) {
      logger.error(`Host not found for service ID: ${service._id}`);
      throw new ApiError(404, "Host not found.");
    }

    if (host.user.toString() !== userId.toString()) {
      logger.error(`User ${userId} is not authorized to delete restaurant ${id}`);
      throw new ApiError(403, "You are not authorized to delete this restaurant.");
    }

    // Delete images from Cloudinary
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

    // Delete cuisine images from Cloudinary
    if (restaurant.cuisineDetails && restaurant.cuisineDetails.length > 0) {
      for (const cuisine of restaurant.cuisineDetails) {
        if (cuisine.image) {
          try {
            await deleteFromCloudinary(cuisine.image);
            logger.info(`Deleted cuisine image from Cloudinary: ${cuisine.image}`);
          } catch (error) {
            logger.error(`Failed to delete cuisine image from Cloudinary: ${cuisine.image}`, error);
            throw new ApiError(500, "Failed to delete cuisine images from Cloudinary.");
          }
        }
      }
    }

    const deletedRestaurant = await Restaurant.findByIdAndDelete(id);
    if (!deletedRestaurant) {
      logger.error(`Failed to delete restaurant with ID: ${id}`);
      throw new ApiError(500, "Failed to delete the restaurant.");
    }

    logger.info(`Restaurant deleted successfully with ID: ${id}`);
    res.status(200).json(new ApiResponse(200, null, "Restaurant deleted successfully."));
  } catch (error) {
    logger.error(`Error deleting restaurant: ${error.message}`);
    throw new ApiError(500, "Failed to delete the restaurant.");
  }
});

// Upload images for a restaurant
const uploadRestaurantImages = asyncHandler(async (req, res) => {
  try {
    const {id} = req.params;
    const userId = req.user._id;
    const files = req.files;

    logger.info(`Starting uploadRestaurantImages process for restaurant ID: ${id} by user ID: ${userId}`);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.error(`Invalid restaurant ID: ${id}`);
      throw new ApiError(400, "Invalid restaurant ID.");
    }

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      logger.error(`Restaurant not found with ID: ${id}`);
      throw new ApiError(404, "Restaurant not found.");
    }

    const service = await Service.findById(restaurant.service);
    if (!service) {
      logger.error(`Service not found for restaurant ID: ${id}`);
      throw new ApiError(404, "Service not found.");
    }

    const host = await Host.findById(service.host);
    if (!host) {
      logger.error(`Host not found for service ID: ${service._id}`);
      throw new ApiError(404, "Host not found.");
    }

    if (host.user.toString() !== userId.toString()) {
      logger.error(`User ${userId} is not authorized to upload images for restaurant ${id}`);
      throw new ApiError(403, "You are not authorized to upload images for this restaurant.");
    }

    if (!files || files.length === 0) {
      logger.error("No images were uploaded.");
      throw new ApiError(400, "No images were uploaded.");
    }

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

    restaurant.images = [
      ...(restaurant.images || []),
      ...newImageUrls
    ];
    const updatedRestaurant = await restaurant.save();

    if (!updatedRestaurant) {
      logger.error(`Failed to update restaurant with ID: ${id}`);
      throw new ApiError(500, "Failed to update the restaurant with new images.");
    }

    logger.info(`Restaurant images updated successfully for restaurant ID: ${id}`);
    res.status(200).json(new ApiResponse(200, updatedRestaurant, "Restaurant images updated successfully."));
  } catch (error) {
    logger.error(`Error uploading restaurant images: ${error.message}`);
    throw new ApiError(500, "Failed to upload restaurant images.");
  }
});

// Update images for a restaurant
const updateRestaurantImages = asyncHandler(async (req, res) => {
  try {
    const {id} = req.params;
    const userId = req.user._id;
    const files = req.files;

    logger.info(`Starting updateRestaurantImages process for restaurant ID: ${id} by user ID: ${userId}`);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.error(`Invalid restaurant ID: ${id}`);
      throw new ApiError(400, "Invalid restaurant ID.");
    }

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      logger.error(`Restaurant not found with ID: ${id}`);
      throw new ApiError(404, "Restaurant not found.");
    }

    const service = await Service.findById(restaurant.service);
    if (!service) {
      logger.error(`Service not found for restaurant ID: ${id}`);
      throw new ApiError(404, "Service not found.");
    }

    const host = await Host.findById(service.host);
    if (!host) {
      logger.error(`Host not found for service ID: ${service._id}`);
      throw new ApiError(404, "Host not found.");
    }

    if (host.user.toString() !== userId.toString()) {
      logger.error(`User ${userId} is not authorized to update images for restaurant ${id}`);
      throw new ApiError(403, "You are not authorized to update images for this restaurant.");
    }

    if (!files || files.length === 0) {
      logger.error("No images were uploaded.");
      throw new ApiError(400, "No images were uploaded.");
    }

    // Delete old images from Cloudinary
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

    // Upload new images to Cloudinary
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

    restaurant.images = newImageUrls;
    const updatedRestaurant = await restaurant.save();

    if (!updatedRestaurant) {
      logger.error(`Failed to update restaurant with ID: ${id}`);
      throw new ApiError(500, "Failed to update the restaurant with new images.");
    }

    logger.info(`Restaurant images updated successfully for restaurant ID: ${id}`);
    res.status(200).json(new ApiResponse(200, updatedRestaurant, "Restaurant images updated successfully."));
  } catch (error) {
    logger.error(`Error updating restaurant images: ${error.message}`);
    throw new ApiError(500, "Failed to update restaurant images.");
  }
});

// Upload cuisine images for a restaurant
const uploadCuisineImages = asyncHandler(async (req, res) => {
  try {
    const {id, cuisineId} = req.params;
    const userId = req.user._id;
    const file = req.file; // Changed from req.files to req.file

    logger.info(`Starting uploadCuisineImages process for restaurant ID: ${id}, cuisine ID: ${cuisineId} by user ID: ${userId}`);

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(cuisineId)) {
      logger.error(`Invalid restaurant ID: ${id} or cuisine ID: ${cuisineId}`);
      throw new ApiError(400, "Invalid restaurant or cuisine ID.");
    }

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      logger.error(`Restaurant not found with ID: ${id}`);
      throw new ApiError(404, "Restaurant not found.");
    }

    // Verify user authorization
    const service = await Service.findById(restaurant.service);
    const host = await Host.findById(
      service
      ?.host);
    if (!host || host.user.toString() !== userId.toString()) {
      logger.error(`User ${userId} is not authorized to upload images for restaurant ${id}`);
      throw new ApiError(403, "You are not authorized to upload images for this restaurant.");
    }

    // Check if image was uploaded
    if (!file) {
      logger.error("No image file provided");
      throw new ApiError(400, "Please provide a cuisine image");
    }

    // Find the cuisine item
    const cuisineIndex = restaurant.cuisineDetails.findIndex(c => c._id.toString() === cuisineId);
    if (cuisineIndex === -1) {
      logger.error(`Cuisine not found with ID: ${cuisineId}`);
      throw new ApiError(404, "Cuisine not found.");
    }

    // Upload new image to Cloudinary
    const cloudinaryResponse = await uploadOnCloudinary(file.path);
    if (
      !cloudinaryResponse
      ?.secure_url) {
      logger.error("Failed to upload new image to Cloudinary");
      throw new ApiError(500, "Failed to upload cuisine image");
    }

    // Delete old image if exists
    if (restaurant.cuisineDetails[cuisineIndex].image) {
      try {
        await deleteFromCloudinary(restaurant.cuisineDetails[cuisineIndex].image);
        logger.info(`Deleted old cuisine image from Cloudinary`);
      } catch (error) {
        logger.error(`Failed to delete old cuisine image from Cloudinary`, error);
        // Don't throw error here as we can continue with new image upload
      }
    }

    // Update the cuisine image
    restaurant.cuisineDetails[cuisineIndex].image = cloudinaryResponse.secure_url;
    const updatedRestaurant = await restaurant.save();

    logger.info(`Cuisine image updated successfully for restaurant ID: ${id}, cuisine ID: ${cuisineId}`);
    res.status(200).json(new ApiResponse(200, updatedRestaurant, "Cuisine image updated successfully"));
  } catch (error) {
    logger.error(`Error uploading cuisine image: ${error.message}`, {stack: error.stack});
    throw new ApiError(500, error.message || "Failed to upload cuisine image");
  }
});

// Delete cuisine image for a restaurant
const deleteCuisineImage = asyncHandler(async (req, res) => {
  try {
    const {id, cuisineId} = req.params;
    const userId = req.user._id;

    logger.info(`Starting deleteCuisineImage process for restaurant ID: ${id}, cuisine ID: ${cuisineId} by user ID: ${userId}`);

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(cuisineId)) {
      logger.error(`Invalid restaurant ID: ${id} or cuisine ID: ${cuisineId}`);
      throw new ApiError(400, "Invalid restaurant or cuisine ID.");
    }

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      logger.error(`Restaurant not found with ID: ${id}`);
      throw new ApiError(404, "Restaurant not found.");
    }

    // Verify user authorization
    const service = await Service.findById(restaurant.service);
    const host = await Host.findById(
      service
      ?.host);
    if (!host || host.user.toString() !== userId.toString()) {
      logger.error(`User ${userId} is not authorized to delete images for restaurant ${id}`);
      throw new ApiError(403, "You are not authorized to delete images for this restaurant.");
    }

    // Find the cuisine item
    const cuisineIndex = restaurant.cuisineDetails.findIndex(c => c._id.toString() === cuisineId);
    if (cuisineIndex === -1) {
      logger.error(`Cuisine not found with ID: ${cuisineId}`);
      throw new ApiError(404, "Cuisine not found.");
    }

    // Check if image exists
    if (!restaurant.cuisineDetails[cuisineIndex].image) {
      logger.error(`No image found for cuisine ID: ${cuisineId}`);
      throw new ApiError(404, "No image found for this cuisine.");
    }

    // Delete image from Cloudinary
    try {
      await deleteFromCloudinary(restaurant.cuisineDetails[cuisineIndex].image);
      logger.info(`Deleted cuisine image from Cloudinary`);
    } catch (error) {
      logger.error(`Failed to delete cuisine image from Cloudinary`, error);
      throw new ApiError(500, "Failed to delete cuisine image from Cloudinary.");
    }

    // Remove the image reference
    restaurant.cuisineDetails[cuisineIndex].image = undefined;
    const updatedRestaurant = await restaurant.save();

    logger.info(`Cuisine image deleted successfully for restaurant ID: ${id}, cuisine ID: ${cuisineId}`);
    res.status(200).json(new ApiResponse(200, updatedRestaurant, "Cuisine image deleted successfully."));
  } catch (error) {
    logger.error(`Error deleting cuisine image: ${error.message}`);
    throw new ApiError(500, "Failed to delete cuisine image.");
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
  updateRestaurantImages,
  uploadCuisineImages,
  deleteCuisineImage
};