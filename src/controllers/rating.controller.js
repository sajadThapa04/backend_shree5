import {Rating} from "../models/ratings.model.js";
import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {Host} from "../models/host.model.js";
import logger from "../utils/logger.js"; // Import the logger

/**
 * Add a rating for a host
 */
const addRating = asyncHandler(async (req, res) => {
  const {host, rating} = req.body;
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting addRating process for host: ${host} by user: ${user}`);

  // Step 1: Validate input fields
  if (!host || !rating) {
    logger.error("Host ID and rating are required");
    throw new ApiError(400, "Host ID and rating are required");
  }

  // Step 2: Validate rating value
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    logger.error(`Invalid rating value: ${rating}. Rating must be a whole number between 1 and 5`);
    throw new ApiError(400, "Rating must be a whole number between 1 and 5");
  }

  // Step 3: Round down the rating to the nearest whole number
  const roundedRating = Math.floor(rating);

  // Step 4: Check if the host exists in the database
  const hostExists = await Host.findById(host);
  if (!hostExists) {
    logger.error(`Host not found with ID: ${host}`);
    throw new ApiError(404, "Host not found");
  }

  // Step 5: Check if the user has already rated this host
  const existingRating = await Rating.findOne({user, host});
  if (existingRating) {
    logger.error(`User ${user} has already rated host ${host}`);
    throw new ApiError(400, "You have already rated this host");
  }

  // Step 6: Create a new rating with the rounded value
  const newRating = await Rating.create({user, host, rating: roundedRating});

  logger.info(`Rating added successfully for host: ${host} by user: ${user}`);

  // Step 7: Return the created rating
  res.status(201).json(new ApiResponse(201, newRating, "Rating added successfully"));
});
/**
 * Update a rating for a host
 */
const updateRating = asyncHandler(async (req, res) => {
  const {id} = req.params; // Rating ID
  const {rating} = req.body;
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting updateRating process for rating ID: ${id} by user: ${user}`);

  // Step 1: Validate rating value
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    logger.error(`Invalid rating value: ${rating}. Rating must be a whole number between 1 and 5`);
    throw new ApiError(400, "Rating must be a whole number between 1 and 5");
  }

  // Step 2: Round down the rating to the nearest whole number
  const roundedRating = Math.floor(rating);

  // Step 3: Find the rating to update
  const ratingToUpdate = await Rating.findById(id);
  if (!ratingToUpdate) {
    logger.error(`Rating not found with ID: ${id}`);
    throw new ApiError(404, "Rating not found");
  }

  // Step 4: Check if the authenticated user is the owner of the rating
  if (ratingToUpdate.user.toString() !== user.toString()) {
    logger.error(`User ${user} is not authorized to update rating ID: ${id}`);
    throw new ApiError(403, "You are not authorized to update this rating");
  }

  // Step 5: Check if the new rating is different from the current one
  if (ratingToUpdate.rating === roundedRating) {
    logger.info(`No changes to rating ID: ${id}. Rating remains ${roundedRating}`);
    return res.status(200).json(new ApiResponse(200, ratingToUpdate, "No changes to the rating"));
  }

  // Step 6: Log the old and new rating values (optional for auditing)
  const oldRating = ratingToUpdate.rating;
  logger.info(`Rating updated for host ${ratingToUpdate.host}: ${oldRating} -> ${roundedRating}`);

  // Step 7: Update the rating with the rounded value
  ratingToUpdate.rating = roundedRating;
  await ratingToUpdate.save();

  logger.info(`Rating updated successfully for rating ID: ${id}`);

  // Step 8: Return the updated rating
  res.status(200).json(new ApiResponse(200, ratingToUpdate, "Rating updated successfully"));
});

/**
 * Delete a rating for a host
 */
const deleteRating = asyncHandler(async (req, res) => {
  const {id} = req.params; // Rating ID
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting deleteRating process for rating ID: ${id} by user: ${user}`);

  // Step 1: Find the rating to delete
  const ratingToDelete = await Rating.findById(id);
  if (!ratingToDelete) {
    logger.error(`Rating not found with ID: ${id}`);
    throw new ApiError(404, "Rating not found");
  }

  // Step 2: Check if the authenticated user is the owner of the rating
  if (ratingToDelete.user.toString() !== user.toString()) {
    logger.error(`User ${user} is not authorized to delete rating ID: ${id}`);
    throw new ApiError(403, "You are not authorized to delete this rating");
  }

  // Step 3: Delete the rating
  await Rating.findByIdAndDelete(id);

  logger.info(`Rating deleted successfully for rating ID: ${id}`);

  // Step 4: Return success response
  res.status(200).json(new ApiResponse(200, {}, "Rating deleted successfully"));
});

/**
 * Fetch all ratings for a specific host
 */
const getRatingsForHost = asyncHandler(async (req, res) => {
  const {hostId} = req.params;

  logger.info(`Starting getRatingsForHost process for host ID: ${hostId}`);

  // Step 1: Validate host ID
  if (!hostId) {
    logger.error("Host ID is required");
    throw new ApiError(400, "Host ID is required");
  }

  // Step 2: Fetch all ratings for the host and populate user details
  const ratings = await Rating.find({host: hostId}).populate("user", "fullName profileImage");

  logger.info(`Fetched ${ratings.length} ratings for host ID: ${hostId}`);

  // Step 3: Return the ratings
  res.status(200).json(new ApiResponse(200, ratings, "Ratings fetched successfully"));
});

export {
  addRating,
  updateRating,
  deleteRating,
  getRatingsForHost
};
