import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {RestaurantBooking} from "../models/restaurantBooking.model.js";
import {Host} from "../models/host.model.js";
import {Service} from "../models/services.model.js";
import {Restaurant} from "../models/restaurant.model.js";
import {User} from "../models/user.model.js";
import logger from "../utils/logger.js";

/**
 * Create a new restaurant booking
 */
const createRestaurantBooking = asyncHandler(async (req, res) => {
  const {
    host,
    service,
    restaurant,
    reservationDate,
    reservationTime,
    numberOfGuests,
    totalPrice,
    paymentMethod,
    specialRequests,
    selectedCuisines
  } = req.body;

  const user = req.user._id;

  logger.info(`Starting createRestaurantBooking process for restaurant: ${restaurant} by user: ${user}`);

  // Step 1: Validate input fields
  if (!host || !service || !restaurant || !reservationDate || !reservationTime || !numberOfGuests || !totalPrice || !paymentMethod) {
    logger.error("Missing required fields");
    throw new ApiError(400, "All required fields must be provided");
  }

  // Step 2: Validate reservation date and time
  const currentDate = new Date();
  const parsedReservationDate = new Date(reservationDate);
  const [hours, minutes] = reservationTime.split(":").map(Number);

  if (isNaN(parsedReservationDate.getTime())) {
    logger.error("Invalid reservation date format");
    throw new ApiError(400, "Invalid reservation date format");
  }

  if (parsedReservationDate < currentDate) {
    logger.error("Cannot create a past reservation date");
    throw new ApiError(400, "Reservation date must be in the future");
  }

  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    logger.error("Invalid reservation time");
    throw new ApiError(400, "Invalid reservation time format (HH:MM required)");
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

  // Step 8: Check if the restaurant exists and belongs to the service
  const restaurantExists = await Restaurant.findOne({_id: restaurant, service}).populate("service");
  if (!restaurantExists) {
    logger.error(`Restaurant not found with ID: ${restaurant}`);
    throw new ApiError(404, "Restaurant not found");
  }

  // Additional check to ensure restaurant's service belongs to the host
  if (restaurantExists.service.host.toString() !== host.toString()) {
    logger.error(`Restaurant ${restaurant} belongs to a service that doesn't match the host`);
    throw new ApiError(400, "Restaurant doesn't belong to the specified host");
  }

  // Step 9: Check if the restaurant is open at the requested time
  const reservationDay = parsedReservationDate.toLocaleString("en-US", {weekday: "long"}).toLowerCase();
  const daySchedule = restaurantExists.openingHours.find(oh => oh.day === reservationDay);

  if (!daySchedule) {
    logger.error(`Restaurant is closed on ${reservationDay}`);
    throw new ApiError(400, "Restaurant is closed on the selected day");
  }

  const isWithinOpeningHours = daySchedule.timeSlots.some(slot => {
    const [openHour, openMin] = slot.openingTime.split(":").map(Number);
    const [closeHour, closeMin] = slot.closingTime.split(":").map(Number);

    const reservationDateTime = new Date(parsedReservationDate);
    reservationDateTime.setHours(hours, minutes, 0, 0);

    const openDateTime = new Date(parsedReservationDate);
    openDateTime.setHours(openHour, openMin, 0, 0);

    const closeDateTime = new Date(parsedReservationDate);
    closeDateTime.setHours(closeHour, closeMin, 0, 0);

    return (reservationDateTime >= openDateTime && reservationDateTime <= closeDateTime);
  });

  if (!isWithinOpeningHours) {
    logger.error(`Restaurant is not open at ${reservationTime} on ${reservationDay}`);
    throw new ApiError(400, "Restaurant is not open at the selected time");
  }

  // Step 10: Check for overlapping reservations
  const existingReservation = await RestaurantBooking.findOne({
    restaurant,
    reservationDate: parsedReservationDate,
    reservationTime,
    status: {
      $ne: "cancelled"
    }
  });

  if (existingReservation) {
    logger.error(`Restaurant ${restaurant} already has a reservation for ${reservationDate} at ${reservationTime}`);
    throw new ApiError(400, "Time slot already booked");
  }

  // Step 11: Create a new booking
  const newBooking = await RestaurantBooking.create({
    user,
    host,
    service,
    restaurant,
    reservationDate: parsedReservationDate,
    reservationTime,
    numberOfGuests,
    selectedCuisines,
    totalPrice,
    paymentMethod,
    specialRequests: specialRequests
      ?.trim() || "",
    paymentStatus: "pending",
    status: "pending"
  });

  logger.info(`Restaurant booking created successfully for restaurant: ${restaurant} by user: ${user}`);

  // Step 12: Return the created booking
  res.status(201).json(new ApiResponse(201, newBooking, "Restaurant booking created successfully"));
});

/**
 * Update a restaurant booking
 */
const updateRestaurantBooking = asyncHandler(async (req, res) => {
  const {id} = req.params;
  const {reservationDate, reservationTime, numberOfGuests, specialRequests, selectedCuisines} = req.body;
  const user = req.user._id;

  logger.info(`Starting updateRestaurantBooking process for booking ID: ${id} by user: ${user}`);

  // Step 1: Validate input fields
  if (!reservationDate || !reservationTime || !numberOfGuests) {
    logger.error("Missing required fields");
    throw new ApiError(400, "All required fields must be provided");
  }

  // Step 2: Validate reservation date and time
  const currentDate = new Date();
  const parsedReservationDate = new Date(reservationDate);
  const [hours, minutes] = reservationTime.split(":").map(Number);

  if (isNaN(parsedReservationDate.getTime())) {
    logger.error("Invalid reservation date format");
    throw new ApiError(400, "Invalid reservation date format");
  }

  if (parsedReservationDate < currentDate) {
    logger.error("Cannot update to a past reservation date");
    throw new ApiError(400, "Reservation date must be in the future");
  }

  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    logger.error("Invalid reservation time format");
    throw new ApiError(400, "Invalid reservation time format (HH:MM required)");
  }

  // Step 3: Validate number of guests
  if (!Number.isInteger(numberOfGuests) || numberOfGuests < 1) {
    logger.error("Invalid number of guests");
    throw new ApiError(400, "Number of guests must be a positive integer");
  }

  // Step 4: Find the booking to update
  const booking = await RestaurantBooking.findById(id).populate("restaurant").populate({
    path: "restaurant",
    populate: {
      path: "service",
      select: "host"
    }
  });

  if (!booking) {
    logger.error(`Restaurant booking not found with ID: ${id}`);
    throw new ApiError(404, "Restaurant booking not found");
  }

  // Step 5: Check if the authenticated user is the owner of the booking
  if (booking.user.toString() !== user.toString()) {
    logger.error(`User ${user} is not authorized to update booking ${id}`);
    throw new ApiError(403, "You are not authorized to update this booking");
  }

  // Step 6: Check if the restaurant is open at the new time
  const reservationDay = parsedReservationDate.toLocaleString("en-US", {weekday: "long"}).toLowerCase();
  const daySchedule = booking.restaurant.openingHours.find(oh => oh.day === reservationDay);

  if (!daySchedule) {
    logger.error(`Restaurant is closed on ${reservationDay}`);
    throw new ApiError(400, "Restaurant is closed on the selected day");
  }

  const isWithinOpeningHours = daySchedule.timeSlots.some(slot => {
    const [openHour, openMin] = slot.openingTime.split(":").map(Number);
    const [closeHour, closeMin] = slot.closingTime.split(":").map(Number);

    const reservationDateTime = new Date(parsedReservationDate);
    reservationDateTime.setHours(hours, minutes, 0, 0);

    const openDateTime = new Date(parsedReservationDate);
    openDateTime.setHours(openHour, openMin, 0, 0);

    const closeDateTime = new Date(parsedReservationDate);
    closeDateTime.setHours(closeHour, closeMin, 0, 0);

    return (reservationDateTime >= openDateTime && reservationDateTime <= closeDateTime);
  });

  if (!isWithinOpeningHours) {
    logger.error(`Restaurant is not open at ${reservationTime} on ${reservationDay}`);
    throw new ApiError(400, "Restaurant is not open at the selected time");
  }

  // Step 7: Check for overlapping reservations (excluding current booking)
  const overlappingBooking = await RestaurantBooking.findOne({
    restaurant: booking.restaurant._id,
    reservationDate: parsedReservationDate,
    reservationTime,
    status: {
      $ne: "cancelled"
    },
    _id: {
      $ne: id
    }
  });

  if (overlappingBooking) {
    logger.error(`Time slot ${reservationTime} on ${reservationDate} is already booked`);
    throw new ApiError(400, "This time slot is already booked");
  }

  // Step 8: Update the booking
  booking.reservationDate = parsedReservationDate;
  booking.reservationTime = reservationTime;
  booking.numberOfGuests = numberOfGuests;
  booking.specialRequests = specialRequests
    ?.trim() || "";

  if (selectedCuisines) {
    booking.selectedCuisines = selectedCuisines;
  }

  const updatedBooking = await booking.save();

  if (!updatedBooking) {
    logger.error(`Failed to update restaurant booking with ID: ${id}`);
    throw new ApiError(500, "Failed to update the restaurant booking");
  }

  // Step 9: Return the updated booking
  logger.info(`Restaurant booking updated successfully for booking ID: ${id}`);
  res.status(200).json(new ApiResponse(200, updatedBooking, "Restaurant booking updated successfully"));
});

/**
 * Get all restaurant bookings for a user
 */
const getUserRestaurantBookings = asyncHandler(async (req, res) => {
  const user = req.user._id;

  logger.info(`Starting getUserRestaurantBookings process for user: ${user}`);

  try {
    const bookings = await RestaurantBooking.find({user}).populate("host", "name email phone").populate("service", "name type").populate("restaurant").sort({reservationDate: -1, reservationTime: -1});

    if (!bookings || bookings.length === 0) {
      logger.info(`No restaurant bookings found for user: ${user}`);
      return res.status(200).json(new ApiResponse(200, [], "No restaurant bookings found for this user"));
    }

    logger.info(`Successfully retrieved ${bookings.length} restaurant bookings for user: ${user}`);
    res.status(200).json(new ApiResponse(200, bookings, "User restaurant bookings retrieved successfully"));
  } catch (error) {
    logger.error(`Error fetching restaurant bookings for user ${user}: ${error.message}`);
    throw new ApiError(500, "Failed to retrieve user restaurant bookings");
  }
});

/**
 * Get all bookings for a specific restaurant (host view)
 */
const getRestaurantBookings = asyncHandler(async (req, res) => {
  const {restaurantId} = req.params;
  const userId = req.user._id;

  logger.info(`Starting getRestaurantBookings process for restaurant: ${restaurantId} by user: ${userId}`);

  try {
    // Find the user's host profile
    const user = await User.findById(userId).populate("hostProfile");
    if (!user || !user.hostProfile) {
      logger.error(`User ${userId} doesn't have a host profile`);
      throw new ApiError(403, "You don't have a host profile");
    }

    const hostId = user.hostProfile._id;

    // Verify restaurant belongs to host
    const restaurant = await Restaurant.findOne({_id: restaurantId}).populate("service");

    if (!restaurant) {
      logger.error(`Restaurant not found with ID: ${restaurantId}`);
      throw new ApiError(404, "Restaurant not found");
    }

    if (restaurant.service.host.toString() !== hostId.toString()) {
      logger.error(`Restaurant ${restaurantId} doesn't belong to host ${hostId}`);
      throw new ApiError(403, "You don't have permission to view these bookings");
    }

    const bookings = await RestaurantBooking.find({restaurant: restaurantId}).populate("user", "name email").sort({reservationDate: -1, reservationTime: -1});

    if (!bookings || bookings.length === 0) {
      logger.info(`No bookings found for restaurant: ${restaurantId}`);
      return res.status(200).json(new ApiResponse(200, [], "No bookings found for this restaurant"));
    }

    logger.info(`Successfully retrieved ${bookings.length} bookings for restaurant: ${restaurantId}`);
    res.status(200).json(new ApiResponse(200, bookings, "Restaurant bookings retrieved successfully"));
  } catch (error) {
    logger.error(`Error fetching bookings for restaurant ${restaurantId}: ${error.message}`);
    throw new ApiError(500, "Failed to retrieve restaurant bookings");
  }
});

/**
 * Cancel a restaurant booking
 */
const cancelRestaurantBooking = asyncHandler(async (req, res) => {
  const {id} = req.params;
  const user = req.user._id;

  logger.info(`Starting cancelRestaurantBooking process for booking ID: ${id} by user: ${user}`);

  try {
    const booking = await RestaurantBooking.findById(id);

    if (!booking) {
      logger.error(`Restaurant booking not found with ID: ${id}`);
      throw new ApiError(404, "Restaurant booking not found");
    }

    if (booking.user.toString() !== user.toString()) {
      logger.error(`User ${user} is not authorized to cancel booking ${id}`);
      throw new ApiError(403, "You are not authorized to cancel this booking");
    }

    if (booking.status === "cancelled") {
      logger.error(`Booking ${id} is already cancelled`);
      throw new ApiError(400, "Booking is already cancelled");
    }

    booking.status = "cancelled";
    const cancelledBooking = await booking.save();

    logger.info(`Restaurant booking cancelled successfully for booking ID: ${id}`);
    res.status(200).json(new ApiResponse(200, cancelledBooking, "Restaurant booking cancelled successfully"));
  } catch (error) {
    logger.error(`Error cancelling restaurant booking ${id}: ${error.message}`);
    throw new ApiError(500, "Failed to cancel restaurant booking");
  }
});

export {
  createRestaurantBooking,
  updateRestaurantBooking,
  getUserRestaurantBookings,
  getRestaurantBookings,
  cancelRestaurantBooking
};