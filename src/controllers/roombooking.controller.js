import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {Booking} from "../models/booking.model.js";
import {Host} from "../models/host.model.js";
import logger from "../utils/logger.js";
import {Service} from "../models/services.model.js";
import {Room} from "../models/room.model.js";
import mongoose from "mongoose";

// Common validation function
const validateBookingInputs = (req, isGuestBooking) => {
  const {
    host,
    service,
    room,
    checkInDate,
    checkOutDate,
    numberOfGuests,
    totalPrice,
    paymentMethod
  } = req.body;

  if (!host || !service || !room || !checkInDate || !checkOutDate || !numberOfGuests || !totalPrice || !paymentMethod) {
    throw new ApiError(400, "All required fields must be provided");
  }

  // Date validation
  const currentDateOnly = new Date();
  currentDateOnly.setHours(0, 0, 0, 0);

  const parsedCheckInDate = new Date(checkInDate);
  parsedCheckInDate.setHours(0, 0, 0, 0);

  const parsedCheckOutDate = new Date(checkOutDate);
  parsedCheckOutDate.setHours(0, 0, 0, 0);

  if (isNaN(parsedCheckInDate.getTime()) || isNaN(parsedCheckOutDate.getTime())) {
    throw new ApiError(400, "Invalid date format");
  }

  if (parsedCheckInDate < currentDateOnly) {
    throw new ApiError(400, "Check-in date must be today or in the future");
  }

  if (parsedCheckOutDate <= parsedCheckInDate) {
    throw new ApiError(400, "Check-out date must be after check-in date");
  }

  if (!Number.isInteger(numberOfGuests) || numberOfGuests < 1) {
    throw new ApiError(400, "Number of guests must be a positive integer");
  }

  if (isNaN(totalPrice) || totalPrice <= 0) {
    throw new ApiError(400, "Total price must be a positive number");
  }
};

// Common booking creation function
const createBookingRecord = async (bookingData, roomId, session) => {
  const [newBooking] = await Booking.create([bookingData], {session});

  // Update room's bookedDates
  await Room.findByIdAndUpdate(roomId, {
    $push: {
      bookedDates: {
        checkInDate: bookingData.checkInDate,
        checkOutDate: bookingData.checkOutDate,
        booking: newBooking._id
      }
    }
  }, {session});

  return newBooking;
};

// Create booking for authenticated users
const createUserBooking = asyncHandler(async (req, res) => {
  const {
    host,
    service,
    room,
    checkInDate,
    checkOutDate,
    numberOfGuests,
    totalPrice,
    paymentMethod,
    specialRequests
  } = req.body;

  validateBookingInputs(req, false);

  // Validate entities
  const [hostExists, serviceExists, roomExists] = await Promise.all([
    Host.findById(host),
    Service.findOne({_id: service, host}),
    Room.findOne({_id: room, service}).populate("service")
  ]);

  if (!hostExists || !serviceExists || !roomExists) {
    throw new ApiError(404, "Host, service or room not found");
  }

  if (roomExists.service.host.toString() !== host.toString()) {
    throw new ApiError(400, "Room doesn't belong to the specified host");
  }

  // Validate capacity
  const totalCapacity = roomExists.capacity.adults + roomExists.capacity.children;
  if (numberOfGuests > totalCapacity) {
    throw new ApiError(400, "Number of guests exceeds room capacity");
  }

  // Check availability
  const overlappingBooking = await Booking.findOne({
    room,
    checkInDate: {
      $lt: new Date(checkOutDate)
    },
    checkOutDate: {
      $gt: new Date(checkInDate)
    },
    status: {
      $ne: "cancelled"
    }
  });

  if (overlappingBooking) {
    throw new ApiError(400, "Room is already booked for the selected dates");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const bookingData = {
      user: req.user._id,
      host,
      service,
      room,
      checkInDate: new Date(checkInDate),
      checkOutDate: new Date(checkOutDate),
      numberOfGuests,
      totalPrice,
      paymentMethod,
      specialRequests: specialRequests
        ?.trim() || "",
      paymentStatus: "pending",
      status: "pending",
      bookingSource: req.headers["x-booking-source"] || "web"
    };

    const newBooking = await createBookingRecord(bookingData, room, session);
    await session.commitTransaction();

    res.status(201).json(new ApiResponse(201, newBooking, "Booking created successfully"));
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Booking creation failed: ${error.message}`);
    throw new ApiError(500, "Failed to create booking");
  } finally {
    session.endSession();
  }
});

// Create booking for guests
const createGuestBooking = asyncHandler(async (req, res) => {
  const {
    host,
    service,
    room,
    checkInDate,
    checkOutDate,
    numberOfGuests,
    totalPrice,
    paymentMethod,
    specialRequests
  } = req.body;

  validateBookingInputs(req, true);

  // Validate entities
  const [hostExists, serviceExists, roomExists] = await Promise.all([
    Host.findById(host),
    Service.findOne({_id: service, host}),
    Room.findOne({_id: room, service}).populate("service")
  ]);

  if (!hostExists || !serviceExists || !roomExists) {
    throw new ApiError(404, "Host, service or room not found");
  }

  if (roomExists.service.host.toString() !== host.toString()) {
    throw new ApiError(400, "Room doesn't belong to the specified host");
  }

  // Validate capacity
  const totalCapacity = roomExists.capacity.adults + roomExists.capacity.children;
  if (numberOfGuests > totalCapacity) {
    throw new ApiError(400, "Number of guests exceeds room capacity");
  }

  // Check availability
  const overlappingBooking = await Booking.findOne({
    room,
    checkInDate: {
      $lt: new Date(checkOutDate)
    },
    checkOutDate: {
      $gt: new Date(checkInDate)
    },
    status: {
      $ne: "cancelled"
    }
  });

  if (overlappingBooking) {
    throw new ApiError(400, "Room is already booked for the selected dates");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const bookingData = {
      guestInfo: req.guestInfo, // From middleware
      host,
      service,
      room,
      checkInDate: new Date(checkInDate),
      checkOutDate: new Date(checkOutDate),
      numberOfGuests,
      totalPrice,
      paymentMethod,
      specialRequests: specialRequests
        ?.trim() || "",
      paymentStatus: "pending",
      status: "pending",
      bookingSource: req.headers["x-booking-source"] || "web"
    };

    const newBooking = await createBookingRecord(bookingData, room, session);
    await session.commitTransaction();

    res.status(201).json(new ApiResponse(201, newBooking, "Booking created successfully"));
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Booking creation failed: ${error.message}`);
    throw new ApiError(500, "Failed to create booking");
  } finally {
    session.endSession();
  }
});

/**
 * Update a booking
 */
const updateBooking = asyncHandler(async (req, res) => {
  const {id} = req.params;
  const {checkInDate, checkOutDate, numberOfGuests, specialRequests} = req.body;
  const userId = req.user
    ?._id;

  logger.info(`Starting updateBooking for booking ID: ${id}`);

  // Validate input
  if (!checkInDate || !checkOutDate || !numberOfGuests) {
    logger.error("Missing required fields");
    throw new ApiError(400, "All required fields must be provided");
  }

  const parsedCheckInDate = new Date(checkInDate);
  const parsedCheckOutDate = new Date(checkOutDate);

  if (isNaN(parsedCheckInDate.getTime()) || isNaN(parsedCheckOutDate.getTime())) {
    logger.error("Invalid date format");
    throw new ApiError(400, "Invalid date format");
  }

  if (parsedCheckOutDate <= parsedCheckInDate) {
    logger.error("Check-out before check-in");
    throw new ApiError(400, "Check-out date must be after check-in date");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find booking with room populated
    const booking = await Booking.findById(id).populate("room").session(session);

    if (!booking) {
      logger.error(`Booking not found: ${id}`);
      throw new ApiError(404, "Booking not found");
    }

    // Authorization check
    if ((
      booking.user && booking.user.toString() !== userId
      ?.toString()) || (!booking.user && !req.user)) {
      logger.error(`Unauthorized update attempt`);
      throw new ApiError(403, "Not authorized to update this booking");
    }

    // Check room availability for new dates
    const overlappingBooking = await Booking.findOne({
      room: booking.room._id,
      checkInDate: {
        $lt: parsedCheckOutDate
      },
      checkOutDate: {
        $gt: parsedCheckInDate
      },
      status: {
        $ne: "cancelled"
      },
      _id: {
        $ne: id
      }
    }).session(session);

    if (overlappingBooking) {
      logger.error(`Room already booked for new dates`);
      throw new ApiError(400, "Room is already booked for the selected dates");
    }

    // Update room's bookedDates
    const room = booking.room;
    if (room.bookedDates) {
      // Remove old dates
      room.bookedDates = room.bookedDates.filter(dateRange => dateRange.booking.toString() !== id.toString());

      // Add new dates
      room.bookedDates.push({checkInDate: parsedCheckInDate, checkOutDate: parsedCheckOutDate, booking: id});

      await room.save({session});
    }

    // Update booking
    booking.checkInDate = parsedCheckInDate;
    booking.checkOutDate = parsedCheckOutDate;
    booking.numberOfGuests = numberOfGuests;
    booking.specialRequests = specialRequests
      ?.trim() || "";

    const updatedBooking = await booking.save({session});
    await session.commitTransaction();

    logger.info(`Booking updated successfully: ${id}`);
    res.status(200).json(new ApiResponse(200, updatedBooking, "Booking updated successfully"));
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Booking update failed: ${error.message}`);
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * Cancel a booking
 */
const cancelBooking = asyncHandler(async (req, res) => {
  const {id} = req.params;
  const userId = req.user
    ?._id;

  logger.info(`Starting cancelBooking for booking ID: ${id}`);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const booking = await Booking.findById(id).populate("room").session(session);

    if (!booking) {
      logger.error(`Booking not found: ${id}`);
      throw new ApiError(404, "Booking not found");
    }

    // Authorization check
    if ((
      booking.user && booking.user.toString() !== userId
      ?.toString()) || (!booking.user && !req.user)) {
      logger.error(`Unauthorized cancel attempt`);
      throw new ApiError(403, "Not authorized to cancel this booking");
    }

    // Update booking status
    booking.status = "cancelled";
    const cancelledBooking = await booking.save({session});

    // Remove from room's bookedDates if exists
    if (
      booking.room
      ?.bookedDates) {
      booking.room.bookedDates = booking.room.bookedDates.filter(dateRange => dateRange.booking.toString() !== id.toString());
      await booking.room.save({session});
    }

    await session.commitTransaction();
    logger.info(`Booking cancelled successfully: ${id}`);

    res.status(200).json(new ApiResponse(200, cancelledBooking, "Booking cancelled successfully"));
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Booking cancellation failed: ${error.message}`);
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * Get bookings for a user (authenticated or guest via email)
 */
const getUserBookings = asyncHandler(async (req, res) => {
  const userId = req.user
    ?._id;
  const {email} = req.query; // For guest bookings lookup

  logger.info(
    `Starting getUserBookings for ${userId
    ? "user"
    : "guest"}: ${userId || email}`);

  try {
    let bookings;

    if (userId) {
      // Authenticated user
      bookings = await Booking.find({user: userId}).populate("host", "name email phone").populate("service", "name type").populate("room", "name roomType pricePerNight").sort({checkInDate: -1});
    } else if (email) {
      // Guest user
      bookings = await Booking.find({"guestInfo.email": email.toLowerCase()}).populate("host", "name email phone").populate("service", "name type").populate("room", "name roomType pricePerNight").sort({checkInDate: -1});
    } else {
      throw new ApiError(400, "User ID or guest email required");
    }

    if (!bookings.length) {
      logger.info("No bookings found");
      return res.status(200).json(new ApiResponse(200, [], "No bookings found"));
    }

    logger.info(`Found ${bookings.length} bookings`);
    res.status(200).json(new ApiResponse(200, bookings, "Bookings retrieved successfully"));
  } catch (error) {
    logger.error(`Failed to get bookings: ${error.message}`);
    throw new ApiError(500, "Failed to retrieve bookings");
  }
});

/**
 * Get bookings for a service (host only)
 */
const getServiceBooking = asyncHandler(async (req, res) => {
  const {serviceId} = req.params;
  const userId = req.user
    ?._id;

  logger.info(`Starting getServiceBooking for service: ${serviceId}`);

  try {
    // Verify user is a host
    const user = await User.findById(userId).populate("hostProfile");
    if (
      !user
      ?.hostProfile) {
      logger.error("User is not a host");
      throw new ApiError(403, "Only hosts can access service bookings");
    }

    // Verify service belongs to host
    const service = await Service.findOne({_id: serviceId, host: user.hostProfile._id});

    if (!service) {
      logger.error("Service not found or unauthorized");
      throw new ApiError(404, "Service not found or unauthorized");
    }

    // Get bookings
    const bookings = await Booking.find({service: serviceId}).populate({
      path: "user",
      select: "name email",
      options: {
        retainNullValues: true
      }
    }).populate("room", "name roomType").sort({checkInDate: -1});

    if (!bookings.length) {
      logger.info("No bookings found for service");
      return res.status(200).json(new ApiResponse(200, [], "No bookings found for this service"));
    }

    logger.info(`Found ${bookings.length} bookings for service`);
    res.status(200).json(new ApiResponse(200, bookings, "Service bookings retrieved successfully"));
  } catch (error) {
    logger.error(`Failed to get service bookings: ${error.message}`);
    throw error;
  }
});

export {
  createUserBooking,
  createGuestBooking,
  updateBooking,
  cancelBooking,
  getUserBookings,
  getServiceBooking
};