import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {Booking} from "../models/booking.model.js"; // Import the Booking model
import {Host} from "../models/host.model.js"; // Import the Host model
import logger from "../utils/logger.js"; // Import the logger
import {Service} from "../models/services.model.js";
/**
 * Create a new booking
 */
const createBooking = asyncHandler(async (req, res) => {
  const {
    host, service, // Using service instead of room for consistency
    checkInDate,
    checkOutDate,
    numberOfGuests,
    totalPrice,
    paymentMethod,
    specialRequests
  } = req.body;
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting createBooking process for host: ${host} and service: ${service} by user: ${user}`);

  // Step 1: Validate input fields
  if (!host || !service || !checkInDate || !checkOutDate || !numberOfGuests || !totalPrice || !paymentMethod) {
    logger.error("Missing required fields");
    throw new ApiError(400, "All required fields must be provided");
  }

  // Step 2: Validate check-in and check-out dates
  const currentDate = Date.now();
  const parsedCheckInDate = new Date(checkInDate);
  const parsedCheckOutDate = new Date(checkOutDate);

  if (isNaN(parsedCheckInDate.getTime()) || parsedCheckInDate < currentDate) {
    logger.error("Invalid or past check-in date");
    throw new ApiError(400, "Check-in date must be in the future");
  }

  if (isNaN(parsedCheckOutDate.getTime()) || parsedCheckOutDate <= parsedCheckInDate) {
    logger.error("Invalid check-out date");
    throw new ApiError(400, "Check-out date must be after check-in date");
  }

  // Step 3: Validate number of guests
  if (!Number.isInteger(numberOfGuests) || numberOfGuests < 1) {
    logger.error("Invalid number of guests");
    throw new ApiError(400, "Number of guests must be a positive integer");
  }

  // Step 4: Validate total price
  if (isNaN(totalPrice) || totalPrice <= 0) {
    logger.error("Invalid total price");
    throw new ApiError(400, "Total price must be a positive number");
  }

  // Step 5: Validate payment method
  const validPaymentMethods = ["credit_card", "paypal", "stripe", "razorpay", "esewa"];
  if (!validPaymentMethods.includes(paymentMethod)) {
    logger.error("Invalid payment method");
    throw new ApiError(400, "Invalid payment method");
  }

  // Step 6: Check if the host exists
  const hostExists = await Host.findById(host);
  if (!hostExists) {
    logger.error(`Host not found with ID: ${host}`);
    throw new ApiError(404, "Host not found");
  }

  // Step 7: Check if the service exists and belongs to the host
  const serviceExists = await Service.findOne({_id: service, host});
  if (!serviceExists) {
    logger.error(`Service not found with ID: ${service} or does not belong to host: ${host}`);
    throw new ApiError(404, "Service not found or does not belong to the host");
  }

  // Step 8: Validate service capacity
  if (numberOfGuests > serviceExists.capacity) {
    logger.error(`Number of guests (${numberOfGuests}) exceeds service capacity (${serviceExists.capacity})`);
    throw new ApiError(400, "Number of guests exceeds service capacity");
  }

  // Step 9: Check if the service is available for the selected dates
  const overlappingBookingCount = await Booking.countDocuments({
    service,
    checkInDate: {
      $lt: parsedCheckOutDate
    },
    checkOutDate: {
      $gt: parsedCheckInDate
    },
    status: {
      $ne: "cancelled"
    } // Ignore cancelled bookings
  });

  if (overlappingBookingCount > 0) {
    logger.error(`Service ${service} is already booked for the selected dates`);
    throw new ApiError(400, "Service is already booked for the selected dates");
  }

  // Step 10: Create a new booking
  const newBooking = await Booking.create({
    user, host, service, // Now using service consistently
    checkInDate: parsedCheckInDate,
    checkOutDate: parsedCheckOutDate,
    numberOfGuests,
    totalPrice,
    paymentMethod,
    specialRequests: specialRequests
      ?.trim() || "",
    paymentStatus: "pending", // Default payment status
    status: "pending" // Default booking status
  });

  logger.info(`Booking created successfully for host: ${host} and service: ${service} by user: ${user}`);

  // Step 11: Return the created booking
  res.status(201).json(new ApiResponse(201, newBooking, "Booking created successfully"));
});

/**
 * Update a booking
 */

const updateBooking = asyncHandler(async (req, res) => {
  const {id} = req.params; // Booking ID
  const {checkInDate, checkOutDate, numberOfGuests, specialRequests} = req.body;
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting updateBooking process for booking ID: ${id} by user: ${user}`);

  // Step 1: Validate input fields
  if (!checkInDate || !checkOutDate || !numberOfGuests) {
    logger.error("Missing required fields");
    throw new ApiError(400, "All required fields must be provided");
  }

  // Validate check-in and check-out dates
  const currentDate = Date.now();
  const parsedCheckInDate = new Date(checkInDate);
  const parsedCheckOutDate = new Date(checkOutDate);

  if (isNaN(parsedCheckInDate.getTime()) || parsedCheckInDate < currentDate) {
    logger.error("Invalid or past check-in date");
    throw new ApiError(400, "Check-in date must be in the future");
  }

  if (isNaN(parsedCheckOutDate.getTime()) || parsedCheckOutDate <= parsedCheckInDate) {
    logger.error("Invalid check-out date");
    throw new ApiError(400, "Check-out date must be after check-in date");
  }

  // Validate number of guests
  if (!Number.isInteger(numberOfGuests) || numberOfGuests < 1) {
    logger.error("Invalid number of guests");
    throw new ApiError(400, "Number of guests must be a positive integer");
  }

  // Step 2: Find the booking to update
  const booking = await Booking.findById(id);
  if (!booking) {
    logger.error(`Booking not found with ID: ${id}`);
    throw new ApiError(404, "Booking not found");
  }

  // Step 3: Check if the authenticated user is the owner of the booking
  if (booking.user.toString() !== user.toString()) {
    logger.error(`User ${user} is not authorized to update booking ${id}`);
    throw new ApiError(403, "You are not authorized to update this booking");
  }

  // Step 4: Check if the new dates are available
  const overlappingBookingCount = await Booking.countDocuments({
    service: booking.service,
    checkInDate: {
      $lt: parsedCheckOutDate
    },
    checkOutDate: {
      $gt: parsedCheckInDate
    },
    status: {
      $ne: "cancelled"
    }, // Ignore cancelled bookings
    _id: {
      $ne: id
    } // Exclude the current booking from the check
  });

  if (overlappingBookingCount > 0) {
    logger.error(`Service ${booking.service} is already booked for the selected dates`);
    throw new ApiError(400, "Service is already booked for the selected dates");
  }

  // Step 5: Update the booking
  booking.checkInDate = parsedCheckInDate;
  booking.checkOutDate = parsedCheckOutDate;
  booking.numberOfGuests = numberOfGuests;
  booking.specialRequests = specialRequests
    ?.trim() || "";

  const updatedBooking = await booking.save();
  if (!updatedBooking) {
    logger.error(`Failed to update booking with ID: ${id}`);
    throw new ApiError(500, "Failed to update the booking");
  }

  // Step 6: Return the updated booking
  logger.info(`Booking updated successfully for booking ID: ${id}`);
  res.status(200).json(new ApiResponse(200, updatedBooking, "Booking updated successfully"));
});

/**
 * Cancel a booking
 */

const cancelBooking = asyncHandler(async (req, res) => {
  const {id} = req.params; // Booking ID
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting cancelBooking process for booking ID: ${id} by user: ${user}`);

  // Step 1: Find the booking to cancel
  const booking = await Booking.findById(id);
  if (!booking) {
    logger.error(`Booking not found with ID: ${id}`);
    throw new ApiError(404, "Booking not found");
  }

  // Step 2: Check if the authenticated user is the owner of the booking
  if (booking.user.toString() !== user.toString()) {
    logger.error(`User ${user} is not authorized to cancel booking ${id}`);
    throw new ApiError(403, "You are not authorized to cancel this booking");
  }

  // Step 3: Cancel the booking
  booking.status = "cancelled"; // Update the booking status to "cancelled"
  const cancelledBooking = await booking.save();

  if (!cancelledBooking) {
    logger.error(`Failed to cancel booking with ID: ${id}`);
    throw new ApiError(500, "Failed to cancel the booking");
  }

  // Step 4: Return success response
  logger.info(`Booking cancelled successfully for booking ID: ${id}`);
  res.status(200).json(new ApiResponse(200, cancelledBooking, "Booking cancelled successfully"));
});

/**
 * Fetch all bookings for a specific user
 */
const getUserBookings = asyncHandler(async (req, res) => {
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting getUserBookings process for user: ${user}`);

  // Step 1: Fetch all bookings for the user
  // Step 2: Return the bookings
});

/**
 * Fetch all bookings for a specific host
 */
const getHostBookings = asyncHandler(async (req, res) => {
  const {hostId} = req.params; // Host ID

  logger.info(`Starting getHostBookings process for host ID: ${hostId}`);

  // Step 1: Validate host ID
  // Step 2: Fetch all bookings for the host
  // Step 3: Return the bookings
});

export {
  createBooking,
  updateBooking,
  cancelBooking,
  getUserBookings,
  getHostBookings
};