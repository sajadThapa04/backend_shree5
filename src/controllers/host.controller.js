import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {Host} from "../models/host.model.js";
import {User} from "../models/user.model.js";
import geocodeCoordinates from "../utils/geoCordinates.js";
import {isPhoneValid, isEmailValid} from "../utils/validator.js";
import mongoose from "mongoose";
import logger from "../utils/logger.js";

// Create a new host profile
const createHost = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession(); // Start a MongoDB session for transactions
  session.startTransaction();

  try {
    logger.info("Starting createHost process");

    // First check if user already has a host profile
    const existingUserHost = await Host.findOne({user: req.user._id}).session(session);
    if (existingUserHost) {
      logger.error("User already has a host profile");
      throw new ApiError(400, "You can only create one host profile per account but you can create multiple service");
    }

    // Extract data from the request body
    const {
      // listingType,  Commented out for future reference
      name,
      description,
      phone,
      email,
      policies,
      coordinates
    } = req.body;

    // Get the authenticated user's ID from the request object
    const user = req.user._id;

    // Step 1: Validate required fields
    if (!name || !description || !phone || !email || !coordinates) {
      logger.error("Missing required fields");
      throw new ApiError(400, "All required fields must be provided");
    }

    // Step 2: Validate phone number
    if (!isPhoneValid(phone)) {
      logger.error("Invalid phone number format");
      throw new ApiError(400, "Invalid phone number format");
    }

    // Step 3: Validate email
    if (!isEmailValid(email)) {
      logger.error("Invalid email format");
      throw new ApiError(400, "Invalid email format");
    }

    // Step 4: Check for existing phone or email
    const existingHost = await Host.findOne({
      $or: [{
          phone
        }, {
          email
        }]
    }).session(session);

    if (existingHost) {
      if (existingHost.phone === phone) {
        logger.error("Phone number already in use");
        throw new ApiError(409, "Phone number is already associated with another listing");
      }
      if (existingHost.email === email) {
        logger.error("Email already in use");
        throw new ApiError(409, "Email is already associated with another listing");
      }
    }

    /* Commented out for future reference - listing type will be handled through service model
                                        // Step 4: Validate listing type
                                        const allowedListingTypes = ["restaurant", "hotel", "lodge", "home_stay", "luxury_villa"];
                                        if (!allowedListingTypes.includes(listingType)) {
                                          logger.error("Invalid listing type");
                                          throw new ApiError(400, "Invalid listing type. Allowed types: restaurant, hotel, lodge, home_stay, luxury_villa");
                                        }
                                        */

    // Step 5: Validate coordinates (latitude and longitude)
    if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(coord => typeof coord === "number")) {
      logger.error("Invalid coordinates format");
      throw new ApiError(400, "Coordinates must be an array of [longitude, latitude]");
    }

    // Validate latitude and longitude values
    const [longitude, latitude] = coordinates;
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      logger.error("Invalid coordinates values");
      throw new ApiError(400, "Invalid coordinates. Longitude must be between -180 and 180, and latitude must be between -90 and 90");
    }

    // Step 6: Use Mapbox to get address details from coordinates
    const geocodedAddress = await geocodeCoordinates(coordinates);
    if (!geocodedAddress) {
      logger.error("Failed to geocode coordinates");
      throw new ApiError(500, "Failed to geocode coordinates");
    }

    // Step 7: Check if the user already has a listing with the same coordinates
    const existingListing = await Host.findOne({user, "address.coordinates.coordinates": coordinates}).session(session);
    if (existingListing) {
      logger.error("User already has a listing at this address");
      throw new ApiError(400, "You already have a listing at this address");
    }

    // Step 8: Create the host profile
    const hostData = {
      user,
      // listingType,  Commented out for future reference
      name,
      description,
      address: {
        country: geocodedAddress.country,
        city: geocodedAddress.city,
        street: geocodedAddress.street,
        zipCode: geocodedAddress.zipCode,
        coordinates: {
          type: "Point",
          coordinates: coordinates
        }
      },
      phone,
      email,
      policies: {
        cancellation: policies
          ?.cancellation || "moderate"
      }
    };

    // Step 9: Save the host profile to the database
    const host = await Host.create([hostData], {session});

    // Step 10: Update the user's role to "host" and link the host profile
    const updatedUser = await User.findByIdAndUpdate(user, {
      role: "host",
      hostProfile: host[0]._id
    }, {
      new: true,
      session
    });

    if (!updatedUser) {
      logger.error("Failed to update user role to host");
      await session.abortTransaction();
      session.endSession();
      throw new ApiError(500, "Failed to update user role to host");
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    logger.info("Host created successfully");

    // Step 11: Return the created host profile
    res.status(201).json(new ApiResponse(201, host[0], "Host created successfully"));
  } catch (error) {
    // Abort the transaction in case of any error
    await session.abortTransaction();
    session.endSession();

    logger.error(`Error in createHost: ${error.message}`, {stack: error.stack});

    // Handle specific errors
    if (error instanceof ApiError) {
      throw error;
    }
    if (error.name === "ValidationError") {
      throw new ApiError(400, error.message);
    }
    if (error.code === 11000) {
      throw new ApiError(400, "Duplicate field value entered");
    }
    throw new ApiError(500, error.message || "Failed to create host");
  }
});

// Get a host profile by ID
const getHostById = asyncHandler(async (req, res) => {
  try {
    logger.info("Starting getHostById process");

    // Extract the host ID from the request parameters
    const {id} = req.params;

    // Validate the ID (e.g., check if it's a valid MongoDB ObjectId)
    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.error("Invalid host ID");
      throw new ApiError(400, "Invalid host ID");
    }

    // Validate the host ID
    if (!id) {
      logger.error("Host ID is required");
      throw new ApiError(400, "Host ID is required");
    }

    // Fetch the host from the database
    const host = await Host.findById(id);

    // If the host is not found, throw a 404 error
    if (!host) {
      logger.error("Host not found");
      throw new ApiError(404, "Host not found");
    }

    logger.info("Host fetched successfully");

    // Return the host data
    res.status(200).json(new ApiResponse(200, host, "Host fetched successfully"));
  } catch (error) {
    logger.error(`Error in getHostById: ${error.message}`, {stack: error.stack});

    // Handle specific errors
    if (error instanceof ApiError) {
      throw error; // Re-throw custom API errors
    }
    // Handle Mongoose CastError (invalid ID format)
    if (error.name === "CastError") {
      throw new ApiError(400, "Invalid host ID");
    }
    // Handle other errors
    throw new ApiError(500, error.message || "Failed to fetch host");
  }
});

// Update a host profile
// const updateHost = asyncHandler(async (req, res) => {
//   try {
//     logger.info("Starting updateHost process");

//      Extract the host ID from the request parameters
//     const {id} = req.params;

//      Validate the host ID
//     if (!id) {
//       logger.error("Host ID is required");
//       throw new ApiError(400, "Host ID is required");
//     }

//      Extract updatable fields from the request body
//     const {
//       name,
//       description,
//       phone,
//       email,
//       policies,
//       coordinates,
//       status
//        isFeatured,
//        featuredUntil
//     } = req.body;

//      Validate coordinates (latitude and longitude) if provided
//     if (coordinates) {
//       if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(coord => typeof coord === "number")) {
//         logger.error("Invalid coordinates format");
//         throw new ApiError(400, "Coordinates must be an array of [longitude, latitude]");
//       }

//        Validate latitude and longitude values
//       const [longitude, latitude] = coordinates;
//       if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
//         logger.error("Invalid coordinates values");
//         throw new ApiError(400, "Invalid coordinates. Longitude must be between -180 and 180, and latitude must be between -90 and 90");
//       }
//     }

//      Build the update object
//     const updateData = {};
//     if (name)
//       updateData.name = name;
//     if (description)
//       updateData.description = description;
//     if (phone)
//       updateData.phone = phone;
//     if (email)
//       updateData.email = email;
//     if (
//       policies
//       ?.cancellation)
//       updateData["policies.cancellation"] = policies.cancellation;
//     if (coordinates)
//       updateData["address.coordinates.coordinates"] = coordinates;
//     if (status)
//       updateData.status = status;

//      if (isFeatured !== undefined)
//        updateData.isFeatured = isFeatured;
//      if (featuredUntil)
//        updateData.featuredUntil = featuredUntil;

//      Update the host in the database
//     const updatedHost = await Host.findByIdAndUpdate(id, {
//       $set: updateData
//     }, {
//       new: true,
//       runValidators: true
//     });

//      If the host is not found, throw a 404 error
//     if (!updatedHost) {
//       logger.error("Host not found");
//       throw new ApiError(404, "Host not found");
//     }

//      Check if the authenticated user is the owner of the host profile
//     if (updatedHost.user.toString() !== req.user._id.toString()) {
//       logger.error("Unauthorized to update this host");
//       throw new ApiError(403, "You are not authorized to update this host");
//     }

//     logger.info("Host updated successfully");

//      Return the updated host data
//     res.status(200).json(new ApiResponse(200, updatedHost, "Host updated successfully"));
//   } catch (error) {
//     logger.error(`Error in updateHost: ${error.message}`, {stack: error.stack});

//      Handle specific errors
//     if (error instanceof ApiError) {
//       throw error;  Re-throw custom API errors
//     }
//      Handle Mongoose CastError (invalid ID format)
//     if (error.name === "CastError") {
//       throw new ApiError(400, "Invalid host ID");
//     }
//      Handle Mongoose validation errors
//     if (error.name === "ValidationError") {
//       throw new ApiError(400, error.message);
//     }
//      Handle duplicate key errors (e.g., unique fields)
//     if (error.code === 11000) {
//       throw new ApiError(400, "Duplicate field value entered");
//     }
//      Handle other errors
//     throw new ApiError(500, error.message || "Failed to update host");
//   }
// });

//we are using the other updatehost Controller and updated the previous one
const updateHost = asyncHandler(async (req, res) => {
  try {
    logger.info("Starting updateHost process");

    // Extract the host ID from the request parameters
    const {id} = req.params;

    // Validate the host ID
    if (!id) {
      logger.error("Host ID is required");
      throw new ApiError(400, "Host ID is required");
    }

    // Extract updatable fields from the request body
    const {
      name,
      description,
      phone,
      email,
      policies,
      coordinates,
      status
    } = req.body;

    // Validate coordinates (latitude and longitude) if provided
    let geocodedAddress = null;
    if (coordinates) {
      if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(coord => typeof coord === "number")) {
        logger.error("Invalid coordinates format");
        throw new ApiError(400, "Coordinates must be an array of [longitude, latitude]");
      }

      // Validate latitude and longitude values
      const [longitude, latitude] = coordinates;
      if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        logger.error("Invalid coordinates values");
        throw new ApiError(400, "Invalid coordinates. Longitude must be between -180 and 180, and latitude must be between -90 and 90");
      }

      // Reverse geocode coordinates to get address details
      geocodedAddress = await geocodeCoordinates(coordinates);
      if (!geocodedAddress) {
        logger.error("Failed to geocode coordinates");
        throw new ApiError(500, "Failed to geocode coordinates");
      }
    }

    // Build the update object
    const updateData = {};
    if (name) 
      updateData.name = name;
    if (description) 
      updateData.description = description;
    if (phone) 
      updateData.phone = phone;
    if (email) 
      updateData.email = email;
    if (
      policies
      ?.cancellation) 
      updateData["policies.cancellation"] = policies.cancellation;
    if (coordinates) {
      updateData["address.coordinates"] = {
        type: "Point",
        coordinates: coordinates
      };
      // Update address fields from geocoding
      updateData["address.country"] = geocodedAddress.country;
      updateData["address.city"] = geocodedAddress.city;
      updateData["address.street"] = geocodedAddress.street;
      updateData["address.zipCode"] = geocodedAddress.zipCode;
    }
    if (status) 
      updateData.status = status;
    
    // Update the host in the database
    const updatedHost = await Host.findByIdAndUpdate(id, {
      $set: updateData
    }, {
      new: true,
      runValidators: true
    });

    // If the host is not found, throw a 404 error
    if (!updatedHost) {
      logger.error("Host not found");
      throw new ApiError(404, "Host not found");
    }

    // Check if the authenticated user is the owner of the host profile
    if (updatedHost.user.toString() !== req.user._id.toString()) {
      logger.error("Unauthorized to update this host");
      throw new ApiError(403, "You are not authorized to update this host");
    }

    logger.info("Host updated successfully");

    // Return the updated host data
    res.status(200).json(new ApiResponse(200, updatedHost, "Host updated successfully"));
  } catch (error) {
    logger.error(`Error in updateHost: ${error.message}`, {stack: error.stack});

    // Handle specific errors
    if (error instanceof ApiError) {
      throw error;
    }
    if (error.name === "CastError") {
      throw new ApiError(400, "Invalid host ID");
    }
    if (error.name === "ValidationError") {
      throw new ApiError(400, error.message);
    }
    if (error.code === 11000) {
      throw new ApiError(400, "Duplicate field value entered");
    }
    throw new ApiError(500, error.message || "Failed to update host");
  }
});

// Delete a host profile
const deleteHost = asyncHandler(async (req, res) => {
  try {
    logger.info("Starting deleteHost process");

    // Extract the host ID from the request parameters
    const {id} = req.params;

    // Validate the host ID
    if (!id) {
      logger.error("Host ID is required");
      throw new ApiError(400, "Host ID is required");
    }

    // Fetch the host from the database
    const host = await Host.findById(id);

    // If the host is not found, throw a 404 error
    if (!host) {
      logger.error("Host not found");
      throw new ApiError(404, "Host not found");
    }

    // Check if the authenticated user is the owner of the host profile
    if (host.user.toString() !== req.user._id.toString()) {
      logger.error("Unauthorized to delete this host");
      throw new ApiError(403, "You are not authorized to delete this host");
    }

    // Delete the host from the database
    await Host.findByIdAndDelete(id);

    logger.info("Host deleted successfully");

    // Return a success response
    res.status(200).json(new ApiResponse(200, {}, "Host deleted successfully"));
  } catch (error) {
    logger.error(`Error in deleteHost: ${error.message}`, {stack: error.stack});

    // Handle specific errors
    if (error instanceof ApiError) {
      throw error; // Re-throw custom API errors
    }
    // Handle Mongoose CastError (invalid ID format)
    if (error.name === "CastError") {
      throw new ApiError(400, "Invalid host ID");
    }
    // Handle other errors
    throw new ApiError(500, error.message || "Failed to delete host");
  }
});

// Get all host profiles (with pagination)
const getAllHosts = asyncHandler(async (req, res) => {
  try {
    logger.info("Starting getAllHosts process");

    // Extract query parameters for pagination, sorting, and filtering
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc"
      ? 1
      : -1;
    const filters = {};

    // Validate page and limit
    if (page < 1 || limit < 1) {
      logger.error("Invalid page or limit");
      throw new ApiError(400, "Page and limit must be positive integers");
    }

    // Optional: Add filters based on query parameters
    /* Commented out for future reference - listing type will be handled through service model
                                                if (req.query.listingType) {
                                                  filters.listingType = req.query.listingType;
                                                }
                                                */
    if (req.query.status) {
      filters.status = req.query.status;
    }
    if (req.query.isFeatured) {
      filters.isFeatured = req.query.isFeatured === "true";
    }

    // Aggregation pipeline stages
    const pipeline = [
      // Stage 1: Match hosts based on filters
      {
        $match: filters
      },

      // Stage 2: Sort hosts
      {
        $sort: {
          [sortBy]: sortOrder
        }
      },

      // Stage 3: Lookup to join with the User collection
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userDetails"
        }
      },

      // Stage 4: Unwind the userDetails array
      {
        $unwind: "$userDetails"
      },

      // Stage 5: Project only the required fields
      {
        $project: {
          _id: 1,
          /* listingType: 1, // Commented out for future reference */
          name: 1,
          description: 1,
          address: 1,
          phone: 1,
          email: 1,
          policies: 1,
          status: 1,
          isFeatured: 1,
          featuredUntil: 1,
          createdAt: 1,
          updatedAt: 1,
          userDetails: {
            _id: 1,
            fullName: 1,
            email: 1,
            profileImage: 1
          }
        }
      },

      // Stage 6: Pagination
      {
        $skip: (page - 1) * limit
      }, {
        $limit: limit
      }
    ];

    // Execute the aggregation pipeline
    const hosts = await Host.aggregate(pipeline);
    const totalHosts = await Host.countDocuments(filters);

    if (!hosts || hosts.length === 0) {
      logger.info("No hosts found");
      return res.status(200).json(new ApiResponse(200, {
        hosts: []
      }, "No hosts found"));
    }

    logger.info("All hosts fetched successfully");

    res.status(200).json(new ApiResponse(200, {
      hosts,
      pagination: {
        totalDocs: totalHosts,
        limit,
        totalPages: Math.ceil(totalHosts / limit),
        page,
        hasPrevPage: page > 1,
        hasNextPage: page < Math.ceil(totalHosts / limit),
        prevPage: page > 1
          ? page - 1
          : null,
        nextPage: page < Math.ceil(totalHosts / limit)
          ? page + 1
          : null
      }
    }, "All hosts fetched successfully"));
  } catch (error) {
    logger.error(`Error in getAllHosts: ${error.message}`, {stack: error.stack});

    if (error instanceof ApiError) {
      throw error;
    }
    if (error.name === "CastError") {
      throw new ApiError(400, "Invalid query parameters");
    }
    throw new ApiError(500, error.message || "Failed to fetch all hosts");
  }
});

// Search hosts by location, type, or other criteria
const searchHosts = asyncHandler(async (req, res) => {
  try {
    logger.info("Starting searchHosts process");

    // Extract query parameters from the request
    const {
      /* listingType, // Commented out for future reference */
      page = 1,
      limit = 10,
      sortBy,
      sortOrder = "asc",
      ...filters
    } = req.query;

    // Build the match stage for filtering
    const matchStage = {};

    // Handle nested fields (e.g., address.country)
    if (filters["address.country"]) {
      matchStage["address.country"] = {
        $regex: filters["address.country"],
        $options: "i"
      };
    }

    /* Commented out for future reference - listing type will be handled through service model
                                            // Filter by listing type
                                            if (listingType) {
                                              matchStage.listingType = listingType;
                                            }
                                            */

    // Build the sort stage
    const sortStage = {};
    if (sortBy) {
      sortStage[sortBy] = sortOrder === "asc"
        ? 1
        : -1;
    } else {
      sortStage["createdAt"] = -1;
    }

    // Calculate pagination skip value
    const skip = (page - 1) * limit;

    // Aggregation pipeline
    const aggregationPipeline = [
      {
        $match: matchStage
      }, {
        $sort: sortStage
      }, {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userDetails"
        }
      }, {
        $unwind: "$userDetails"
      }, {
        $project: {
          _id: 1,
          /* listingType: 1, // Commented out for future reference */
          name: 1,
          description: 1,
          address: 1,
          phone: 1,
          email: 1,
          policies: 1,
          status: 1,
          isFeatured: 1,
          featuredUntil: 1,
          createdAt: 1,
          updatedAt: 1,
          userDetails: {
            _id: 1,
            fullName: 1,
            email: 1,
            profileImage: 1
          }
        }
      }, {
        $facet: {
          hosts: [
            {
              $skip: skip
            }, {
              $limit: limit
            }
          ],
          metadata: [
            {
              $count: "totalHosts"
            }
          ]
        }
      }
    ];

    // Execute the aggregation pipeline
    const [result] = await Host.aggregate(aggregationPipeline);
    const hosts = result.hosts;
    const totalHosts = result.metadata[0]
      ?.totalHosts || 0;

    logger.info("Hosts searched successfully");

    res.status(200).json(new ApiResponse(200, {
      hosts,
      pagination: {
        totalHosts,
        totalPages: Math.ceil(totalHosts / limit),
        currentPage: page,
        limit
      }
    }, "Hosts searched successfully"));
  } catch (error) {
    logger.error(`Error in searchHosts: ${error.message}`, {stack: error.stack});
    throw new ApiError(500, error.message || "Failed to search hosts");
  }
});

// Get all host profiles for a specific user
const getHostsByUser = asyncHandler(async (req, res) => {
  try {
    logger.info("Starting getHostsByUser process");

    // Extract the user ID from the request parameters
    const userId = req.params.userId;

    // Validate the user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.error("Invalid user ID");
      throw new ApiError(400, "Invalid user ID");
    }

    // Fetch all host profiles for the specified user
    const hosts = await Host.find({user: userId});

    // Check if any hosts were found
    if (!hosts || hosts.length === 0) {
      logger.error("No hosts found for this user");
      throw new ApiError(404, "No hosts found for this user");
    }

    logger.info("Hosts fetched by user successfully");

    // Return the response with the fetched hosts
    res.status(200).json(new ApiResponse(200, hosts, "Hosts fetched by user successfully"));
  } catch (error) {
    logger.error(`Error in getHostsByUser: ${error.message}`, {stack: error.stack});

    // Handle specific errors
    if (error instanceof ApiError) {
      throw error; // Re-throw custom API errors
    }
    // Handle other errors
    throw new ApiError(500, error.message || "Failed to fetch hosts by user");
  }
});

// we have shifted the below features to the service and room controller

// Upload images for the first time
// const uploadImages = asyncHandler(async (req, res) => {
//   try {
//     logger.info("Starting uploadImages process");

//     const hostId = req.params.id;
//     const files = req.files;  Array of uploaded files
//     const userId = req.user._id;  Authenticated user's ID

//      Validate the host ID
//     if (!mongoose.Types.ObjectId.isValid(hostId)) {
//       logger.error("Invalid host ID");
//       throw new ApiError(400, "Invalid host ID");
//     }

//      Check if files were uploaded
//     if (!files || files.length === 0) {
//       logger.error("No images uploaded");
//       throw new ApiError(400, "No images uploaded");
//     }

//      Fetch the host document
//     const host = await Host.findById(hostId);

//      If the host is not found, throw a 404 error
//     if (!host) {
//       logger.error("Host not found");
//       throw new ApiError(404, "Host not found");
//     }

//      Check if the authenticated user is the owner of the host profile
//     if (host.user.toString() !== userId.toString()) {
//       logger.error("Unauthorized to upload images for this host");
//       throw new ApiError(403, "You are not authorized to upload images for this host");
//     }

//      Upload images to Cloudinary and get their URLs
//     const imageUrls = await Promise.all(files.map(async file => {
//       const localFilePath = file.path;  Temporary file path

//        Upload the image to Cloudinary
//       const cloudinaryResponse = await uploadOnCloudinary(localFilePath);

//        If the upload fails, throw an error
//       if (!cloudinaryResponse || !cloudinaryResponse.secure_url) {
//         logger.error("Failed to upload image to Cloudinary");
//         throw new ApiError(500, "Failed to upload image to Cloudinary");
//       }

//        Return the secure URL of the uploaded image
//       return cloudinaryResponse.secure_url;
//     }));

//      Update the host document with the new image URLs
//     const updatedHost = await Host.findByIdAndUpdate(hostId, {
//       $push: {
//         images: {
//           $each: imageUrls
//         }
//       }
//     }, {
//        Add new images to the `images` array
//       new: true
//     });

//     logger.info("Images uploaded successfully");

//      Return the updated host data
//     res.status(200).json(new ApiResponse(200, updatedHost, "Images uploaded successfully"));
//   } catch (error) {
//     logger.error(`Error in uploadImages: ${error.message}`, {stack: error.stack});
//     throw new ApiError(500, error.message || "Failed to upload images");
//   }
// });

//  Update existing images
// const updateImages = asyncHandler(async (req, res) => {
//   try {
//     logger.info("Starting updateImages process");

//     const hostId = req.params.id;
//     const files = req.files;  Array of uploaded files
//     const userId = req.user._id;  Authenticated user's ID

//      Validate the host ID
//     if (!mongoose.Types.ObjectId.isValid(hostId)) {
//       logger.error("Invalid host ID");
//       throw new ApiError(400, "Invalid host ID");
//     }

//      Check if files were uploaded
//     if (!files || files.length === 0) {
//       logger.error("No images uploaded");
//       throw new ApiError(400, "No images uploaded");
//     }

//      Fetch the existing host document
//     const host = await Host.findById(hostId);

//      If the host is not found, throw a 404 error
//     if (!host) {
//       logger.error("Host not found");
//       throw new ApiError(404, "Host not found");
//     }

//      Check if the authenticated user is the owner of the host profile
//     if (host.user.toString() !== userId.toString()) {
//       logger.error("Unauthorized to update images for this host");
//       throw new ApiError(403, "You are not authorized to update images for this host");
//     }

//      Delete existing images from Cloudinary
//     if (host.images && host.images.length > 0) {
//       await Promise.all(host.images.map(async imageUrl => {
//         const publicId = imageUrl.split("/").pop().split(".")[0];  Extract public ID from URL
//         await deleteFromCloudinary(publicId);  Delete the image from Cloudinary
//       }));
//     }

//      Upload new images to Cloudinary and get their URLs
//     const imageUrls = await Promise.all(files.map(async file => {
//       const localFilePath = file.path;  Temporary file path

//        Upload the image to Cloudinary
//       const cloudinaryResponse = await uploadOnCloudinary(localFilePath);

//        If the upload fails, throw an error
//       if (!cloudinaryResponse || !cloudinaryResponse.secure_url) {
//         logger.error("Failed to upload image to Cloudinary");
//         throw new ApiError(500, "Failed to upload image to Cloudinary");
//       }

//        Return the secure URL of the uploaded image
//       return cloudinaryResponse.secure_url;
//     }));

//      Update the host document with the new image URLs (replace existing images)
//     const updatedHost = await Host.findByIdAndUpdate(hostId, {
//       $set: {
//         images: imageUrls
//       }
//     }, {
//        Replace the `images` array with the new URLs
//       new: true
//     });

//     logger.info("Images updated successfully");

//      Return the updated host data
//     res.status(200).json(new ApiResponse(200, updatedHost, "Images updated successfully"));
//   } catch (error) {
//     logger.error(`Error in updateImages: ${error.message}`, {stack: error.stack});
//     throw new ApiError(500, error.message || "Failed to update images");
//   }
// });

export {
  createHost,
  getHostById,
  updateHost,
  deleteHost,
  getAllHosts,
  searchHosts,
  getHostsByUser
  // uploadImages,
  // updateImages
};