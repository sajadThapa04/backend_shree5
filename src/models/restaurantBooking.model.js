// models/restaurantBooking.model.js
import mongoose, {Schema} from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const restaurantBookingSchema = new Schema({
  // Reference to the User who made the booking
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  // Reference to the Host
  host: {
    type: Schema.Types.ObjectId,
    ref: "Host",
    required: true
  },

  // Reference to the Service
  service: {
    type: Schema.Types.ObjectId,
    ref: "Service",
    required: true
  },

  // Reference to the Restaurant
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true
  },

  // Booking details
  reservationDate: {
    type: Date,
    required: true
  },

  reservationTime: {
    type: String, // Format: "HH:MM"
    required: true,
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Time must be in HH:MM format"]
  },

  numberOfGuests: {
    type: Number,
    required: true,
    min: [1, "Must have at least 1 guest"]
  },

  selectedCuisines: [
    {
      name: String,
      price: Number
    }
  ],

  totalPrice: {
    type: Number,
    required: true,
    min: [0, "Price cannot be negative"]
  },

  paymentMethod: {
    type: String,
    enum: [
      "credit_card", "paypal", "stripe", "razorpay", "esewa"
    ],
    required: true
  },

  paymentStatus: {
    type: String,
    enum: [
      "pending", "paid", "failed", "refunded"
    ],
    default: "pending"
  },

  paymentDate: {
    type: Date,
    default: null
  },

  specialRequests: {
    type: String,
    trim: true,
    maxlength: [500, "Special requests cannot exceed 500 characters"]
  },

  status: {
    type: String,
    enum: [
      "pending", "confirmed", "cancelled", "completed"
    ],
    default: "pending"
  },

  // For tracking purposes
  cancellationReason: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true
  },
  toObject: {
    virtuals: true
  }
});

// Indexes for better query performance
restaurantBookingSchema.index({user: 1});
restaurantBookingSchema.index({host: 1});
restaurantBookingSchema.index({restaurant: 1});
restaurantBookingSchema.index({status: 1});
restaurantBookingSchema.index({paymentStatus: 1});
restaurantBookingSchema.index({reservationDate: 1, reservationTime: 1});

// Virtual for formatted reservation datetime
restaurantBookingSchema.virtual("reservationDateTime").get(function () {
  return `${this.reservationDate.toDateString()} at ${this.reservationTime}`;
});

// Auto-set payment date when payment is successful
restaurantBookingSchema.pre("save", function (next) {
  if (this.paymentStatus === "paid" && !this.paymentDate) {
    this.paymentDate = new Date();
  }
  next();
});

// Plugin for pagination
restaurantBookingSchema.plugin(mongoosePaginate);

const RestaurantBooking = mongoose.model("RestaurantBooking", restaurantBookingSchema);

export {
  RestaurantBooking
};
