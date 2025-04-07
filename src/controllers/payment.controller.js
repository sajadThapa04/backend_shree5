import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {Payment} from "../models/payment.models.js"; // Import the Payment model
import {Booking} from "../models/booking.model.js"; // Import the Booking model
import {User} from "../models/user.model.js"; //importing User model
import logger from "../utils/logger.js"; // Import the logger
import {createStripePaymentIntent, refundStripePayment, handleStripeWebhook, confirmStripePaymentIntent} from "../utils/payment_gateways/stripe.js";
import {validatePaymentFields} from "../utils/payment_utils.js";
import dotenv from "dotenv";

dotenv.config({path: "./.env"});
/**
 * Handle Stripe webhook events
 */
// console.log(process.env.STRIPE_WEBHOOK_SECRET);

// payment.controller.js
const handleStripeWebhookController = asyncHandler(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const payload = req.body; // This is the raw body

  console.log("signature-header", sig);
  console.log("Raw Payload:", payload); // Log the raw payload

  try {
    // Verify the webhook signature and construct the event
    const event = await handleStripeWebhook(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
    logger.info(`Stripe webhook event received: ${event.type}`);

    // Handle the event
    switch (event.type) {
      case "payment_intent.created":
        const createdPaymentIntent = event.data.object;
        logger.info(`PaymentIntent created: ${createdPaymentIntent.id}`);
        logger.info(`PaymentIntent metadata: ${JSON.stringify(createdPaymentIntent.metadata)}`);

        // Check if the payment already exists
        const existingPayment = await Payment.findOne({transactionId: createdPaymentIntent.id});
        if (existingPayment) {
          logger.info(`Payment already exists for transaction ID: ${createdPaymentIntent.id}`);
          return res.json({received: true}); // Acknowledge the event without further processing
        }

        // Fetch the booking and user details from the database
        const booking = await Booking.findById(createdPaymentIntent.metadata.booking);
        const user = await User.findById(createdPaymentIntent.metadata.user);

        if (!booking || !user) {
          logger.error(`Booking or User not found for payment intent: ${createdPaymentIntent.id}`);
          return res.status(404).json({error: "Booking or User not found"});
        }

        // Verify that the user in the metadata is the owner of the booking
        if (booking.user.toString() !== createdPaymentIntent.metadata.user) {
          logger.error(`User ${createdPaymentIntent.metadata.user} is not the owner of booking ${createdPaymentIntent.metadata.booking}`);
          return res.status(403).json({error: "Unauthorized access to booking"});
        }

        try {
          // Create a new payment record in your database
          const newPayment = await Payment.create({
            user: user._id,
            booking: booking._id,
            paymentMethod: "stripe",
            amount: createdPaymentIntent.amount / 100, // Convert from cents to dollars
            transactionId: createdPaymentIntent.id,
            paymentStatus: createdPaymentIntent.status,
            paymentMetadata: {
              gateway: "stripe", // Ensure this is included
              gatewayResponse: createdPaymentIntent, // Save the entire payment intent object
              gatewayId: createdPaymentIntent.id // Save the payment intent ID
            }
          });

          if (!newPayment) {
            logger.error(`Failed to create payment for transaction ID: ${createdPaymentIntent.id}`);
          } else {
            logger.info(`Payment created successfully for transaction ID: ${createdPaymentIntent.id}`);
          }
        } catch (error) {
          logger.error(`Database Create Error: ${error.message}`);
        }
        break;

      case "payment_intent.succeeded":
        const succeededPaymentIntent = event.data.object;
        logger.info(`PaymentIntent succeeded: ${succeededPaymentIntent.id}`);
        logger.info(`PaymentIntent metadata: ${JSON.stringify(succeededPaymentIntent.metadata)}`); // Log metadata

        try {
          // Validate metadata
          if (!succeededPaymentIntent.metadata || !succeededPaymentIntent.metadata.booking || !succeededPaymentIntent.metadata.user) {
            logger.error(`Missing metadata for payment intent: ${succeededPaymentIntent.id}`);
            return res.json({received: true}); // Acknowledge the event without further processing
          }

          // Check if the payment exists
          const existingPayment = await Payment.findOne({transactionId: succeededPaymentIntent.id});
          if (!existingPayment) {
            logger.error(`Payment not found for transaction ID: ${succeededPaymentIntent.id}`);
            return res.json({received: true});
          }

          // Update the payment status in your database
          const updatedPayment = await Payment.findOneAndUpdate({
            transactionId: succeededPaymentIntent.id
          }, {
            paymentStatus: "succeeded"
          }, {new: true});

          if (!updatedPayment) {
            logger.error(`Payment not found for transaction ID: ${succeededPaymentIntent.id}`);
          } else {
            logger.info(`Payment status updated to succeeded for transaction ID: ${succeededPaymentIntent.id}`);
          }
        } catch (error) {
          logger.error(`Database Update Error: ${error.message}`);
          // Optionally, you can return a more specific error response to Stripe
          return res.status(500).json({error: "Internal Server Error"});
        }
        break;

      case "payment_intent.payment_failed":
        const failedPaymentIntent = event.data.object;
        logger.info(`PaymentIntent failed: ${failedPaymentIntent.id}`);

        try {
          // Update the payment status in your database
          const updatedPayment = await Payment.findOneAndUpdate({
            transactionId: failedPaymentIntent.id
          }, {
            paymentStatus: "failed"
          }, {new: true});

          if (!updatedPayment) {
            logger.error(`Payment not found for transaction ID: ${failedPaymentIntent.id}`);
          } else {
            logger.info(`Payment status updated to failed for transaction ID: ${failedPaymentIntent.id}`);
          }
        } catch (error) {
          logger.error(`Database Update Error: ${error.message}`);
        }
        break;

      case "payment_intent.canceled":
        const canceledPaymentIntent = event.data.object;
        logger.info(`PaymentIntent canceled: ${canceledPaymentIntent.id}`);

        try {
          // Update the payment status in your database
          const updatedPayment = await Payment.findOneAndUpdate({
            transactionId: canceledPaymentIntent.id
          }, {
            paymentStatus: "canceled"
          }, {new: true});

          if (!updatedPayment) {
            logger.error(`Payment not found for transaction ID: ${canceledPaymentIntent.id}`);
          } else {
            logger.info(`Payment status updated to canceled for transaction ID: ${canceledPaymentIntent.id}`);
          }
        } catch (error) {
          logger.error(`Database Update Error: ${error.message}`);
        }
        break;

      case "charge.succeeded":
        const succeededCharge = event.data.object;
        logger.info(`Charge succeeded: ${succeededCharge.id}`);

        try {
          // Update the payment status in your database
          const updatedPayment = await Payment.findOneAndUpdate({
            transactionId: succeededCharge.payment_intent
          }, {
            paymentStatus: "succeeded"
          }, {new: true});

          if (!updatedPayment) {
            logger.error(`Payment not found for transaction ID: ${succeededCharge.payment_intent}`);
          } else {
            logger.info(`Payment status updated to succeeded for transaction ID: ${succeededCharge.payment_intent}`);
          }
        } catch (error) {
          logger.error(`Database Update Error: ${error.message}`);
        }
        break;

      case "charge.updated":
        const updatedCharge = event.data.object;
        logger.info(`Charge updated: ${updatedCharge.id}`);
        // Handle the updated charge (e.g., log or update database)
        break;
        // Handle other event types (charge.succeeded, payment_intent.payment_failed, etc.)
      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    // Return a response to acknowledge receipt of the event
    res.json({received: true});
  } catch (error) {
    logger.error(`Webhook Error: ${error.message}`);
    throw new ApiError(400, `Webhook Error: ${error.message}`);
  }
});
/**
 * Create a new payment
 */
const createPayment = asyncHandler(async (req, res) => {
  const {booking, paymentMethod, amount, transactionId, paymentMetadata} = req.body;
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting createPayment process for booking: ${booking} by user: ${user}`);

  // Step 1: Validate input fields
  if (!booking || !paymentMethod || !amount || !transactionId) {
    logger.error("Missing required fields");
    throw new ApiError(400, "All required fields must be provided");
  }

  // Step 2: Validate payment amount
  if (isNaN(amount) || amount <= 0) {
    logger.error("Invalid payment amount");
    throw new ApiError(400, "Payment amount must be a positive number");
  }

  // Step 3: Validate payment method
  const validPaymentMethods = ["stripe", "paypal", "razorpay", "esewa", "credit_card"];
  if (!validPaymentMethods.includes(paymentMethod)) {
    logger.error("Invalid payment method");
    throw new ApiError(400, "Invalid payment method");
  }

  // Step 4: Check if the booking exists
  const bookingExists = await Booking.findById(booking);
  if (!bookingExists) {
    logger.error(`Booking not found with ID: ${booking}`);
    throw new ApiError(404, "Booking not found");
  }

  // Step 5: Verify that the authenticated user is the owner of the booking
  if (bookingExists.user.toString() !== user.toString()) {
    logger.error(`User ${user} is not the owner of booking ${booking}`);
    throw new ApiError(403, "You are not authorized to make a payment for this booking");
  }

  // Step 6: Handle Stripe payment
  if (paymentMethod === "stripe") {
    try {
      // Validate payment fields using the utility function
      validatePaymentFields({amount, transactionId, paymentMethod});

      // Create a Stripe payment intent
      const paymentIntent = await createStripePaymentIntent(amount, "usd", {
        booking: booking.toString(), // Pass booking ID
        user: user.toString(), // Pass user ID
        ...paymentMetadata // Include any additional metadata
      });

      // Check if the payment already exists
      const existingPayment = await Payment.findOne({transactionId: paymentIntent.id});
      if (existingPayment) {
        logger.info(`Payment already exists for transaction ID: ${paymentIntent.id}`);
        return res.status(200).json(new ApiResponse(200, existingPayment, "Payment already exists"));
      }

      // Save the payment in the database
      const newPayment = await Payment.create({
        user,
        booking,
        paymentMethod,
        amount,
        transactionId: paymentIntent.id, // Use Stripe payment intent ID as transaction ID
        paymentMetadata: {
          gateway: "stripe", // Ensure this is included
          gatewayResponse: paymentIntent, // Save the entire payment intent object
          gatewayId: paymentIntent.id // Save the payment intent ID
        },
        paymentStatus: paymentIntent.status // Set payment status based on Stripe response
      });

      logger.info(`Stripe payment created successfully for booking: ${booking} by user: ${user}`);
      return res.status(201).json(new ApiResponse(201, newPayment, "Payment created successfully"));
    } catch (error) {
      logger.error(`Stripe Error: ${error.message}`);
      throw new ApiError(500, `Payment processing failed: ${error.message}`);
    }
  }

  // Step 7: Handle other payment methods (e.g., PayPal, Razorpay)
  throw new ApiError(400, "Payment method not yet supported");
});

/**
 * Confirm a Stripe PaymentIntent
 */
const confirmPayment = asyncHandler(async (req, res) => {
  const {paymentIntentId, paymentMethodId} = req.body;

  if (!paymentIntentId || !paymentMethodId) {
    logger.error("Missing required fields: paymentIntentId or paymentMethodId");
    throw new ApiError(400, "paymentIntentId and paymentMethodId are required");
  }

  try {
    // Confirm the PaymentIntent
    const confirmedPaymentIntent = await confirmStripePaymentIntent(paymentIntentId, paymentMethodId);

    // Update the payment status in your database
    const updatedPayment = await Payment.findOneAndUpdate({
      transactionId: paymentIntentId
    }, {
      paymentStatus: confirmedPaymentIntent.status
    }, {new: true});

    if (!updatedPayment) {
      logger.error(`Payment not found for transaction ID: ${paymentIntentId}`);
      throw new ApiError(404, "Payment not found");
    }

    logger.info(`PaymentIntent confirmed and payment status updated: ${paymentIntentId}`);
    return res.status(200).json(new ApiResponse(200, updatedPayment, "Payment confirmed successfully"));
  } catch (error) {
    logger.error(`Stripe Error: ${error.message}`);
    throw new ApiError(500, `Payment confirmation failed: ${error.message}`);
  }
});

/**
 * Update payment status
 */
const updatePaymentStatus = asyncHandler(async (req, res) => {
  const {id} = req.params; // Payment ID
  const {paymentStatus} = req.body;
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting updatePaymentStatus process for payment ID: ${id} by user: ${user}`);

  // Step 1: Validate input fields
  if (!paymentStatus) {
    logger.error("Missing required fields");
    throw new ApiError(400, "Payment status is required");
  }

  // Step 2: Validate payment status
  const validPaymentStatuses = [
    "requires_payment_method", // Add this value
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
  if (!validPaymentStatuses.includes(paymentStatus)) {
    logger.error("Invalid payment status");
    throw new ApiError(400, "Invalid payment status");
  }

  // Step 3: Find the payment to update
  const payment = await Payment.findById(id);
  if (!payment) {
    logger.error(`Payment not found with ID: ${id}`);
    throw new ApiError(404, "Payment not found");
  }

  // Step 4: Check if the authenticated user is the owner of the payment
  if (payment.user.toString() !== user.toString()) {
    logger.error(`User ${user} is not authorized to update payment ${id}`);
    throw new ApiError(403, "You are not authorized to update this payment");
  }

  // Step 5: Update the payment status
  payment.paymentStatus = paymentStatus;
  const updatedPayment = await payment.save();

  if (!updatedPayment) {
    logger.error(`Failed to update payment with ID: ${id}`);
    throw new ApiError(500, "Failed to update the payment");
  }

  // Step 6: Return the updated payment
  logger.info(`Payment status updated successfully for payment ID: ${id}`);
  res.status(200).json(new ApiResponse(200, updatedPayment, "Payment status updated successfully"));
});

/**
 * Fetch all payments for a specific user
 */
const getUserPayments = asyncHandler(async (req, res) => {
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting getUserPayments process for user: ${user}`);

  // Step 1: Fetch all payments for the user
  const payments = await Payment.find({user});

  // Step 2: Return the payments
  res.status(200).json(new ApiResponse(200, payments, "Payments fetched successfully"));
});

/**
 * Fetch payment details by ID
 */
const getPaymentById = asyncHandler(async (req, res) => {
  const {id} = req.params; // Payment ID
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting getPaymentById process for payment ID: ${id} by user: ${user}`);

  // Step 1: Find the payment
  const payment = await Payment.findById(id);
  if (!payment) {
    logger.error(`Payment not found with ID: ${id}`);
    throw new ApiError(404, "Payment not found");
  }

  // Step 2: Check if the authenticated user is the owner of the payment
  if (payment.user.toString() !== user.toString()) {
    logger.error(`User ${user} is not authorized to access payment ${id}`);
    throw new ApiError(403, "You are not authorized to access this payment");
  }

  // Step 3: Return the payment details
  res.status(200).json(new ApiResponse(200, payment, "Payment details fetched successfully"));
});

/**
 * Handle payment refund
 */
const handleRefund = asyncHandler(async (req, res) => {
  const {id} = req.params; // Payment ID
  const user = req.user._id; // Authenticated user's ID

  logger.info(`Starting handleRefund process for payment ID: ${id} by user: ${user}`);

  // Step 1: Find the payment
  const payment = await Payment.findById(id);
  if (!payment) {
    logger.error(`Payment not found with ID: ${id}`);
    throw new ApiError(404, "Payment not found");
  }

  // Step 2: Check if the authenticated user is the owner of the payment
  if (payment.user.toString() !== user.toString()) {
    logger.error(`User ${user} is not authorized to refund payment ${id}`);
    throw new ApiError(403, "You are not authorized to refund this payment");
  }

  // Step 3: Handle Stripe refund
  if (payment.paymentMethod === "stripe") {
    try {
      await refundStripePayment(payment.transactionId, payment.amount);

      // Update payment status in the database
      payment.refundStatus = "fully_refunded";
      payment.paymentStatus = "refunded";
      await payment.save();

      logger.info(`Stripe refund processed successfully for payment ID: ${id}`);
      return res.status(200).json(new ApiResponse(200, payment, "Refund processed successfully"));
    } catch (error) {
      logger.error(`Stripe Refund Error: ${error.message}`);
      throw new ApiError(500, "Refund processing failed");
    }
  }

  // Step 4: Handle other payment methods (e.g., PayPal, Razorpay)
  throw new ApiError(400, "Refund not supported for this payment method");
});

export {
  createPayment,
  updatePaymentStatus,
  getUserPayments,
  getPaymentById,
  handleRefund,
  confirmPayment,
  handleStripeWebhookController // Export the webhook handler
};