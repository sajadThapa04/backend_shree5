import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {Review} from "../models/reviews.model.js"; // Import the Review model
import {Host} from "../models/host.model.js"; // Import the Host model
import logger from "../utils/logger.js"; // Import the logger

/**
 * Add a review for a host
 */
const addReview = asyncHandler(async (req, res) => {
  const {host, comment} = req.body;
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting addReview process for host: ${host} by user: ${user}`);

  // Step 1: Validate input fields
  if (!host || !comment) {
    logger.error("Host ID and comment are required");
    throw new ApiError(400, "Host ID and comment are required");
  }

  // Step 2: Validate comment length
  if (comment.length > 500) {
    logger.error(`Comment exceeds maximum length of 500 characters`);
    throw new ApiError(400, "Comment must be less than 500 characters");
  }

  // Step 3: Check if the host exists in the database
  const hostExists = await Host.findById(host);
  if (!hostExists) {
    logger.error(`Host not found with ID: ${host}`);
    throw new ApiError(404, "Host not found");
  }

  // Step 4: Check if the user has already reviewed this host
  const existingReview = await Review.findOne({user, host});
  if (existingReview) {
    logger.error(`User ${user} has already reviewed host ${host}`);
    throw new ApiError(400, "You have already reviewed this host");
  }

  // Step 5: Create a new review
  const newReview = await Review.create({user, host, comment});

  logger.info(`Review added successfully for host: ${host} by user: ${user}`);

  // Step 6: Return the created review
  res.status(201).json(new ApiResponse(201, newReview, "Review added successfully"));
});

/**
 * Update a review for a host
 */
const updateReview = asyncHandler(async (req, res) => {
  const {id} = req.params; // Review ID
  const {comment} = req.body;
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting updateReview process for review ID: ${id} by user: ${user}`);

  // Step 1: Validate comment length
  if (comment && comment.length > 500) {
    logger.error(`Comment exceeds maximum length of 500 characters`);
    throw new ApiError(400, "Comment must be less than 500 characters");
  }

  // Step 2: Find the review to update
  const reviewToUpdate = await Review.findById(id);
  if (!reviewToUpdate) {
    logger.error(`Review not found with ID: ${id}`);
    throw new ApiError(404, "Review not found");
  }

  // Step 3: Check if the authenticated user is the owner of the review
  if (reviewToUpdate.user.toString() !== user.toString()) {
    logger.error(`User ${user} is not authorized to update review ID: ${id}`);
    throw new ApiError(403, "You are not authorized to update this review");
  }

  // Step 4: Check if the new comment is different from the current one
  if (reviewToUpdate.comment === comment) {
    logger.info(`No changes to review ID: ${id}. Comment remains the same`);
    return res.status(200).json(new ApiResponse(200, reviewToUpdate, "No changes to the review"));
  }

  // Step 5: Update the review
  reviewToUpdate.comment = comment;
  await reviewToUpdate.save();

  logger.info(`Review updated successfully for review ID: ${id}`);

  // Step 6: Return the updated review
  res.status(200).json(new ApiResponse(200, reviewToUpdate, "Review updated successfully"));
});

/**
 * Delete a review for a host
 */
const deleteReview = asyncHandler(async (req, res) => {
  const {id} = req.params; // Review ID
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting deleteReview process for review ID: ${id} by user: ${user}`);

  // Step 1: Find the review to delete
  const reviewToDelete = await Review.findById(id);
  if (!reviewToDelete) {
    logger.error(`Review not found with ID: ${id}`);
    throw new ApiError(404, "Review not found");
  }

  // Step 2: Check if the authenticated user is the owner of the review
  if (reviewToDelete.user.toString() !== user.toString()) {
    logger.error(`User ${user} is not authorized to delete review ID: ${id}`);
    throw new ApiError(403, "You are not authorized to delete this review");
  }

  // Step 3: Delete the review
  await Review.findByIdAndDelete(id);

  logger.info(`Review deleted successfully for review ID: ${id}`);

  // Step 4: Return success response
  res.status(200).json(new ApiResponse(200, {}, "Review deleted successfully"));
});

/**
 * Fetch all reviews for a specific host
 */
const getReviewsForHost = asyncHandler(async (req, res) => {
  const {hostId} = req.params;

  logger.info(`Starting getReviewsForHost process for host ID: ${hostId}`);

  // Step 1: Validate host ID
  if (!hostId) {
    logger.error("Host ID is required");
    throw new ApiError(400, "Host ID is required");
  }

  // Step 2: Fetch all reviews for the host and populate user details
  const reviews = await Review.find({host: hostId}).populate("user", "fullName profileImage");

  logger.info(`Fetched ${reviews.length} reviews for host ID: ${hostId}`);

  // Step 3: Return the reviews
  res.status(200).json(new ApiResponse(200, reviews, "Reviews fetched successfully"));
});

export {
  addReview,
  updateReview,
  deleteReview,
  getReviewsForHost
};
