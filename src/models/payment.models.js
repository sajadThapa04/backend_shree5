import mongoose, {Schema} from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const paymentSchema = new Schema({
  // Reference to the User who made the payment
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // Reference to the booking related to the payment
  booking: {
    type: Schema.Types.ObjectId,
    ref: "Booking",
    required: true
  },
  // Payment status (pending, paid, failed, refunded, etc.)
  paymentStatus: {
    type: String,
    enum: [
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
    ],
    required: true,
    default: "requires_payment_method"
  },
  // Payment method used (PayPal, Stripe, Razorpay, etc.)
  paymentMethod: {
    type: String,
    enum: [
      "paypal", "stripe", "razorpay", "esewa", "credit_card"
    ],
    required: true
  },
  // Total amount for the payment
  amount: {
    type: Number,
    required: true,
    min: [0, "Amount cannot be negative"]
  },
  // Transaction ID for tracking the payment
  transactionId: {
    type: String,
    required: function () {
      return this.paymentMethod !== "stripe"; // Required only for non-Stripe payments
    },
    trim: true,
    unique: true
  },
  // Date of the payment attempt
  paymentDate: {
    type: Date,
    default: Date.now
  },
  // Refund status if the payment is refunded
  refundStatus: {
    type: String,
    enum: [
      "not_refunded", "partially_refunded", "fully_refunded"
    ],
    default: "not_refunded"
  },
  // Payment metadata (can be expanded based on gateway response)
  paymentMetadata: {
    type: {
      gateway: {
        type: String,
        required: true
      }, // e.g., "stripe", "paypal"
      gatewayResponse: {
        type: Schema.Types.Mixed
      }, // Raw response from the payment gateway
      gatewayId: {
        type: String
      } // e.g., paymentIntent.id for Stripe
    },
    required: true
  }
}, {timestamps: true});

// Indexes for better querying
paymentSchema.index({user: 1});
paymentSchema.index({booking: 1});
paymentSchema.index({paymentStatus: 1});
paymentSchema.index({paymentMethod: 1});

// Auto-set refund status if the payment is refunded
paymentSchema.pre("save", function (next) {
  if (this.paymentStatus === "refunded" && this.refundStatus === "not_refunded") {
    this.refundStatus = "fully_refunded"; // Set refund status to fully refunded if it's refunded
  }

  // Ensure paymentStatus is valid
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
  if (!validStatuses.includes(this.paymentStatus)) {
    throw new Error(`Invalid paymentStatus: ${this.paymentStatus}`);
  }

  next();
});

// Virtual field for payment success
paymentSchema.virtual("isPaymentSuccessful").get(function () {
  return this.paymentStatus === "paid";
});

// Method to process refunds
paymentSchema.methods.processRefund = async function (refundAmount) {
  if (this.paymentStatus !== "succeeded") {
    throw new Error("Refund can only be processed for successful payments");
  }

  if (refundAmount > this.amount) {
    throw new Error("Refund amount cannot exceed the payment amount");
  }

  // Update refund status
  if (refundAmount === this.amount) {
    this.refundStatus = "fully_refunded";
  } else {
    this.refundStatus = "partially_refunded";
  }

  // Update payment status
  this.paymentStatus = "refunded";

  await this.save();
};

// Plugin for pagination
paymentSchema.plugin(mongoosePaginate);

const Payment = mongoose.model("Payment", paymentSchema);

export {
  Payment
};
