import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {Booking} from "../models/booking.model.js"; // Import the Booking model
import {Host} from "../models/host.model.js"; // Import the Host model
import logger from "../utils/logger.js"; // Import the logger
import {Service} from "../models/services.model.js";
import {Room} from "../models/room.model.js";
import {User} from "../models/user.model.js";

/**
 * Create a new booking
 */
const createBooking = asyncHandler(async (req, res) => {
  const {
    host, service, room, // Added room field
    checkInDate,
    checkOutDate,
    numberOfGuests,
    totalPrice,
    paymentMethod,
    specialRequests
  } = req.body;
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting createBooking process for host: ${host}, service: ${service}, room: ${room} by user: ${user}`);

  // Step 1: Validate input fields
  if (!host || !service || !room || !checkInDate || !checkOutDate || !numberOfGuests || !totalPrice || !paymentMethod) {
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

  // Step 8: Check if the room exists and belongs to the service
  const roomExists = await Room.findOne({_id: room, service: service}).populate("service"); // Populate the service to check host relationship

  if (!roomExists) {
    logger.error(`Room not found with ID: ${room}`);
    throw new ApiError(404, "Room not found");
  }

  // Additional check to ensure room's service belongs to the host
  if (roomExists.service.host.toString() !== host.toString()) {
    logger.error(`Room ${room} belongs to a service that doesn't match the host`);
    throw new ApiError(400, "Room doesn't belong to the specified host");
  }

  // Step 9: Validate room capacity
  const totalCapacity = roomExists.capacity.adults + roomExists.capacity.children;
  if (numberOfGuests > totalCapacity) {
    logger.error(`Number of guests (${numberOfGuests}) exceeds room capacity (${totalCapacity})`);
    throw new ApiError(400, "Number of guests exceeds room capacity");
  }

  // Step 10: Check if the room is available for the selected dates
  const overlappingBookingCount = await Booking.countDocuments({
    room,
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
    logger.error(`Room ${room} is already booked for the selected dates`);
    throw new ApiError(400, "Room is already booked for the selected dates");
  }

  // Step 11: Create a new booking
  const newBooking = await Booking.create({
    user, host, service, room, // Include room in the booking
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

  // Step 12: Update room's bookedDates (only if the field exists)
  if (roomExists.bookedDates && Array.isArray(roomExists.bookedDates)) {
    roomExists.bookedDates.push({checkInDate: parsedCheckInDate, checkOutDate: parsedCheckOutDate, booking: newBooking._id});
    await roomExists.save();
  } else {
    logger.warn(`Room ${room} does not have bookedDates array, skipping update`);
  }

  logger.info(`Booking created successfully for host: ${host}, service: ${service}, room: ${room} by user: ${user}`);
  // Step 13: Return the created booking
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
  const booking = await Booking.findById(id).populate("room");
  if (!booking) {
    logger.error(`Booking not found with ID: ${id}`);
    throw new ApiError(404, "Booking not found");
  }

  // Step 3: Check if the authenticated user is the owner of the booking
  if (booking.user.toString() !== user.toString()) {
    logger.error(`User ${user} is not authorized to update booking ${id}`);
    throw new ApiError(403, "You are not authorized to update this booking");
  }

  // Step 4: Check if the new dates are available for the room
  const overlappingBookingCount = await Booking.countDocuments({
    room: booking.room._id,
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
    logger.error(`Room ${booking.room._id} is already booked for the selected dates`);
    throw new ApiError(400, "Room is already booked for the selected dates");
  }

  // Step 5: Validate room capacity
  if (numberOfGuests > booking.room.capacity) {
    logger.error(`Number of guests (${numberOfGuests}) exceeds room capacity (${booking.room.capacity})`);
    throw new ApiError(400, "Number of guests exceeds room capacity");
  }

  // Step 6: Update the room's bookedDates (remove old dates, add new ones)
  const room = await Room.findById(booking.room._id);
  if (room) {
    // Remove the old booking dates
    room.bookedDates = room.bookedDates.filter(dateRange => dateRange.booking.toString() !== id.toString());

    // Add the new booking dates
    room.bookedDates.push({checkInDate: parsedCheckInDate, checkOutDate: parsedCheckOutDate, booking: id});

    await room.save();
  }

  // Step 7: Update the booking
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

  // Step 8: Return the updated booking
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

  try {
    // Step 1: Fetch all bookings for the user with populated details
    const bookings = await Booking.find({user}).populate("host", "name email phone"). // Basic host info
    populate("service", "name type"). // Basic service info
    populate("room", "name roomType pricePerNight"). // Basic room info
    sort({checkInDate: -1}); // Sort by newest first

    // Step 2: Validate if bookings exist
    if (!bookings || bookings.length === 0) {
      logger.info(`No bookings found for user: ${user}`);
      return res.status(200).json(new ApiResponse(200, [], "No bookings found for this user"));
    }

    logger.info(`Successfully retrieved ${bookings.length} bookings for user: ${user}`);

    // Step 3: Return the bookings
    res.status(200).json(new ApiResponse(200, bookings, "User bookings retrieved successfully"));
  } catch (error) {
    logger.error(`Error fetching bookings for user ${user}: ${error.message}`);
    throw new ApiError(500, "Failed to retrieve user bookings");
  }
});

/**
 * Fetch all bookings for a specific service
 */
const getServiceBooking = asyncHandler(async (req, res) => {
  const {serviceId} = req.params;
  const userId = req.user
    ?._id; // Authenticated user's ID
  logger.info(`Starting getServiceBooking process for service ID: ${serviceId} by user: ${userId}`);

  try {
    // Step 1: Find the user's host profile
    const user = await User.findById(userId).populate("hostProfile");
    if (!user || !user.hostProfile) {
      logger.error(`User ${userId} doesn't have a host profile`);
      throw new ApiError(403, "You don't have a host profile");
    }

    const hostId = user.hostProfile._id;

    // Step 2: Validate service exists and belongs to host
    const service = await Service.findOne({_id: serviceId, host: hostId});

    if (!service) {
      logger.error(`Service ${serviceId} not found or doesn't belong to host ${hostId}`);
      throw new ApiError(404, "Service not found or unauthorized");
    }

    // Step 3: Fetch all bookings for the service
    const bookings = await Booking.find({service: serviceId}).populate("user", "name email"). // Basic user info
    populate("room", "name roomType"). // Basic room info
    sort({checkInDate: -1}); // Sort by newest first

    // Step 4: Validate if bookings exist
    if (!bookings || bookings.length === 0) {
      logger.info(`No bookings found for service: ${serviceId}`);
      return res.status(200).json(new ApiResponse(200, [], "No bookings found for this service"));
    }

    logger.info(`Successfully retrieved ${bookings.length} bookings for service: ${serviceId}`);

    // Step 5: Return the bookings
    res.status(200).json(new ApiResponse(200, bookings, "Service bookings retrieved successfully"));
  } catch (error) {
    logger.error(`Error fetching bookings for service ${serviceId}: ${error.message}`);
    throw new ApiError(500, "Failed to retrieve service bookings");
  }
});

export {
  createBooking,
  updateBooking,
  cancelBooking,
  getUserBookings,
  getServiceBooking
};