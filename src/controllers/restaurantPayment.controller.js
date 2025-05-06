import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {RestaurantPayment} from "../models/restaurantPayment.model.js";
import {RestaurantBooking} from "../models/restaurantBooking.model.js";
import {User} from "../models/user.model.js";
import logger from "../utils/logger.js";
import {createStripePaymentIntent, refundStripePayment, handleStripeWebhook, confirmStripePaymentIntent} from "../utils/payment_gateways/stripe.js";
import {validatePaymentFields} from "../utils/payment_utils.js";
import dotenv from "dotenv";

dotenv.config({path: "./.env"});

/**
 * Handle Stripe webhook events for restaurant bookings
 */
const handleRestaurantStripeWebhookController = asyncHandler(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const payload = req.body;

  try {
    const event = await handleStripeWebhook(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
    logger.info(`Stripe webhook event received: ${event.type}`);

    switch (event.type) {
      case "payment_intent.created":
        const createdPaymentIntent = event.data.object;
        const booking = await RestaurantBooking.findById(createdPaymentIntent.metadata.booking);
        const user = await User.findById(createdPaymentIntent.metadata.user);

        if (!booking || !user) {
          logger.error(`Booking or User not found for payment intent: ${createdPaymentIntent.id}`);
          return res.status(404).json({error: "Booking or User not found"});
        }

        if (booking.user.toString() !== createdPaymentIntent.metadata.user) {
          logger.error(`User ${createdPaymentIntent.metadata.user} is not the owner of booking ${createdPaymentIntent.metadata.booking}`);
          return res.status(403).json({error: "Unauthorized access to booking"});
        }

        await RestaurantPayment.create({
          user: user._id,
          restaurantBooking: booking._id,
          paymentMethod: "stripe",
          amount: createdPaymentIntent.amount / 100,
          transactionId: createdPaymentIntent.id,
          paymentStatus: createdPaymentIntent.status,
          paymentMetadata: {
            gateway: "stripe",
            gatewayResponse: createdPaymentIntent,
            gatewayId: createdPaymentIntent.id
          }
        });
        break;

      case "payment_intent.succeeded":
        const succeededPaymentIntent = event.data.object;
        await RestaurantPayment.findOneAndUpdate({
          transactionId: succeededPaymentIntent.id
        }, {paymentStatus: "succeeded"});

        // Update restaurant booking payment status
        await RestaurantBooking.findOneAndUpdate({
          _id: succeededPaymentIntent.metadata.booking
        }, {paymentStatus: "paid"});
        break;

      case "payment_intent.payment_failed":
        const failedPaymentIntent = event.data.object;
        await RestaurantPayment.findOneAndUpdate({
          transactionId: failedPaymentIntent.id
        }, {paymentStatus: "failed"});
        break;

      case "charge.refunded":
        const refundedCharge = event.data.object;
        await RestaurantPayment.findOneAndUpdate({
          transactionId: refundedCharge.payment_intent
        }, {
          paymentStatus: "refunded",
          refundStatus: "fully_refunded"
        });

        // Update restaurant booking status if refunded
        await RestaurantBooking.findOneAndUpdate({
          _id: refundedCharge.metadata.booking
        }, {
          paymentStatus: "refunded",
          status: "cancelled"
        });
        break;

      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    res.json({received: true});
  } catch (error) {
    logger.error(`Webhook Error: ${error.message}`);
    throw new ApiError(400, `Webhook Error: ${error.message}`);
  }
});

/**
 * Create a new payment for restaurant booking
 */
const createRestaurantPayment = asyncHandler(async (req, res) => {
  const {bookingId, paymentMethod, amount, transactionId, paymentMetadata} = req.body;
  const user = req.user._id;

  logger.info(`Starting createRestaurantPayment for booking: ${bookingId} by user: ${user}`);

  // Step 1: Validate input fields
  if (!bookingId || !paymentMethod || !amount) {
    logger.error("Missing required fields");
    throw new ApiError(400, "All required fields must be provided");
  }
  if (isNaN(amount) || amount <= 0) {
    throw new ApiError(400, "Invalid payment amount");
  }

  const validPaymentMethods = ["stripe", "paypal", "razorpay", "esewa", "credit_card"];
  if (!validPaymentMethods.includes(paymentMethod)) {
    throw new ApiError(400, "Invalid payment method");
  }

  // Verify booking exists and belongs to user
  const booking = await RestaurantBooking.findById(bookingId);
  if (!booking) {
    throw new ApiError(404, "Restaurant booking not found");
  }

  if (booking.user.toString() !== user.toString()) {
    throw new ApiError(403, "Not authorized to pay for this booking");
  }

  // Handle Stripe payment
  if (paymentMethod === "stripe") {
    try {
      validatePaymentFields({amount, paymentMethod});

      const paymentIntent = await createStripePaymentIntent(amount, "usd", {
        booking: bookingId,
        user: user,
        ...paymentMetadata
      });

      const newPayment = await RestaurantPayment.create({
        user,
        restaurantBooking: bookingId,
        paymentMethod,
        amount,
        transactionId: paymentIntent.id,
        paymentMetadata: {
          gateway: "stripe",
          gatewayResponse: paymentIntent,
          gatewayId: paymentIntent.id
        },
        paymentStatus: paymentIntent.status
      });

      // Update booking with payment info
      await RestaurantBooking.findByIdAndUpdate(bookingId, {paymentMethod, paymentStatus: "pending"});

      return res.status(201).json(new ApiResponse(201, newPayment, "Payment created successfully"));
    } catch (error) {
      logger.error(`Stripe Error: ${error.message}`);
      throw new ApiError(500, `Payment processing failed: ${error.message}`);
    }
  }

  // Handle non-Stripe payments
  if (!transactionId) {
    throw new ApiError(400, "Transaction ID is required for non-Stripe payments");
  }

  try {
    const newPayment = await RestaurantPayment.create({
      user,
      restaurantBooking: bookingId,
      paymentMethod,
      amount,
      transactionId,
      paymentMetadata: paymentMetadata || {
        gateway: paymentMethod,
        gatewayResponse: {}
      },
      paymentStatus: "pending"
    });

    // Update booking with payment info
    await RestaurantBooking.findByIdAndUpdate(bookingId, {paymentMethod, paymentStatus: "pending"});

    return res.status(201).json(new ApiResponse(201, newPayment, "Payment created successfully"));
  } catch (error) {
    logger.error(`Payment creation error: ${error.message}`);
    throw new ApiError(500, "Payment creation failed");
  }
});

/**
 * Confirm a Stripe PaymentIntent for restaurant booking
 */
const confirmRestaurantPayment = asyncHandler(async (req, res) => {
  const {paymentIntentId, paymentMethodId} = req.body;

  if (!paymentIntentId || !paymentMethodId) {
    throw new ApiError(400, "paymentIntentId and paymentMethodId are required");
  }

  try {
    const confirmedPaymentIntent = await confirmStripePaymentIntent(paymentIntentId, paymentMethodId);
    const updatedPayment = await RestaurantPayment.findOneAndUpdate({
      transactionId: paymentIntentId
    }, {
      paymentStatus: confirmedPaymentIntent.status
    }, {new: true});

    if (!updatedPayment) {
      throw new ApiError(404, "Payment not found");
    }

    // Update restaurant booking payment status if succeeded
    if (confirmedPaymentIntent.status === "succeeded") {
      await RestaurantBooking.findByIdAndUpdate(updatedPayment.restaurantBooking, {paymentStatus: "paid"});
    }

    return res.status(200).json(new ApiResponse(200, updatedPayment, "Payment confirmed successfully"));
  } catch (error) {
    logger.error(`Stripe Error: ${error.message}`);
    throw new ApiError(500, `Payment confirmation failed: ${error.message}`);
  }
});

/**
 * Update restaurant payment status
 */
const updateRestaurantPaymentStatus = asyncHandler(async (req, res) => {
  const {id} = req.params;
  const {paymentStatus} = req.body;
  const user = req.user._id;

  logger.info(`Updating payment status for payment ID: ${id}`);

  if (!paymentStatus) {
    throw new ApiError(400, "Payment status is required");
  }

  const validStatuses = [
    "requires_payment_method",
    "requires_confirmation",
    "requires_action",
    "processing",
    "requires_capture",
    "succeeded",
    "canceled",
    "failed",
    "pending",
    "paid",
    "refunded"
  ];

  if (!validStatuses.includes(paymentStatus)) {
    throw new ApiError(400, "Invalid payment status");
  }

  const payment = await RestaurantPayment.findById(id);
  if (!payment) {
    throw new ApiError(404, "Payment not found");
  }

  if (payment.user.toString() !== user.toString()) {
    throw new ApiError(403, "Not authorized to update this payment");
  }

  payment.paymentStatus = paymentStatus;
  const updatedPayment = await payment.save();

  // Update restaurant booking if payment succeeded or failed
  if (paymentStatus === "succeeded" || paymentStatus === "paid") {
    await RestaurantBooking.findByIdAndUpdate(payment.restaurantBooking, {paymentStatus: "paid"});
  } else if (paymentStatus === "failed") {
    await RestaurantBooking.findByIdAndUpdate(payment.restaurantBooking, {paymentStatus: "failed"});
  } else if (paymentStatus === "refunded") {
    await RestaurantBooking.findByIdAndUpdate(payment.restaurantBooking, {
      paymentStatus: "refunded",
      status: "cancelled"
    });
  }

  return res.status(200).json(new ApiResponse(200, updatedPayment, "Payment status updated successfully"));
});

/**
 * Get all payments for a user's restaurant bookings
 */
const getUserRestaurantPayments = asyncHandler(async (req, res) => {
  const user = req.user._id;

  const payments = await RestaurantPayment.find({user}).populate({
    path: "restaurantBooking",
    match: {
      _id: {
        $exists: true
      }
    },
    model: "RestaurantBooking"
  }).sort({createdAt: -1});

  return res.status(200).json(new ApiResponse(200, payments, "Payments fetched successfully"));
});

/**
 * Get payment details by ID for restaurant booking
 */
const getRestaurantPaymentById = asyncHandler(async (req, res) => {
  const {id} = req.params;
  const user = req.user._id;

  const payment = await RestaurantPayment.findById(id).populate({path: "restaurantBooking", model: "RestaurantBooking"});

  if (!payment) {
    throw new ApiError(404, "Payment not found");
  }

  if (payment.user.toString() !== user.toString()) {
    throw new ApiError(403, "Not authorized to access this payment");
  }

  return res.status(200).json(new ApiResponse(200, payment, "Payment details fetched successfully"));
});

/**
 * Handle refund for restaurant booking payment
 */
const handleRestaurantPaymentRefund = asyncHandler(async (req, res) => {
  const {id} = req.params;
  const user = req.user._id;

  const payment = await RestaurantPayment.findById(id);
  if (!payment) {
    throw new ApiError(404, "Payment not found");
  }

  if (payment.user.toString() !== user.toString()) {
    throw new ApiError(403, "Not authorized to refund this payment");
  }

  // Handle Stripe refund
  if (payment.paymentMethod === "stripe") {
    try {
      await refundStripePayment(payment.transactionId, payment.amount);

      payment.refundStatus = "fully_refunded";
      payment.paymentStatus = "refunded";
      await payment.save();

      // Update restaurant booking status
      await RestaurantBooking.findByIdAndUpdate(payment.restaurantBooking, {
        paymentStatus: "refunded",
        status: "cancelled"
      });

      return res.status(200).json(new ApiResponse(200, payment, "Refund processed successfully"));
    } catch (error) {
      logger.error(`Stripe Refund Error: ${error.message}`);
      throw new ApiError(500, "Refund processing failed");
    }
  }

  // Handle non-Stripe refunds
  payment.refundStatus = "fully_refunded";
  payment.paymentStatus = "refunded";
  await payment.save();

  // Update restaurant booking status
  await RestaurantBooking.findByIdAndUpdate(payment.restaurantBooking, {
    paymentStatus: "refunded",
    status: "cancelled"
  });

  return res.status(200).json(new ApiResponse(200, payment, "Refund processed successfully"));
});

export {
  handleRestaurantStripeWebhookController,
  createRestaurantPayment,
  confirmRestaurantPayment,
  updateRestaurantPaymentStatus,
  getUserRestaurantPayments,
  getRestaurantPaymentById,
  handleRestaurantPaymentRefund
};