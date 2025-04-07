import mongoose, {Schema} from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const bookingSchema = new Schema({
  // Reference to the User who made the booking
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // Reference to the Host being booked
  host: {
    type: Schema.Types.ObjectId,
    ref: "Host",
    required: true
  },
  service: {
    type: mongoose.Types.ObjectId,
    ref: "Service",
    required: true
  },

  // Reference to the Room being booked will add this feature in future
  //   room: {
  //     type: Schema.Types.ObjectId,
  //     ref: "Room",
  //     required: true
  //   },

  // Booking dates
  checkInDate: {
    type: Date,
    required: true,
    validate: {
      validator: function (value) {
        return value >= new Date(); // Ensure check-in date is not in the past
      },
      message: "Check-in date must be in the future."
    }
  },
  checkOutDate: {
    type: Date,
    required: true,
    validate: {
      validator: function (value) {
        return value > this.checkInDate; // Ensure check-out date is after check-in date
      },
      message: "Check-out date must be after check-in date."
    }
  },
  // Number of guests
  numberOfGuests: {
    type: Number,
    default: 1,
    min: [1, "Number of guests must be at least 1."]
  },
  // Total price for the booking
  totalPrice: {
    type: Number,
    required: true,
    min: [0, "Total price cannot be negative."]
  },
  // Payment details
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
  paymentMethod: {
    type: String,
    enum: [
      "paypal", "stripe", "razorpay", "esewa"
    ],
    required: true
  },
  transactionId: {
    type: String,
    trim: true
  },
  // Booking status
  status: {
    type: String,
    enum: [
      "pending", "confirmed", "cancelled", "completed"
    ],
    default: "pending"
  },
  // Additional notes or special requests from the user
  specialRequests: {
    type: String,
    trim: true,
    maxlength: [500, "Special requests cannot exceed 500 characters."]
  }
}, {timestamps: true});

// Add indexing for better performance
bookingSchema.index({user: 1});
bookingSchema.index({host: 1});
bookingSchema.index({room: 1});
bookingSchema.index({status: 1});
bookingSchema.index({paymentStatus: 1});

// Virtual field for booking duration (in days)
bookingSchema.virtual("duration").get(function () {
  return Math.ceil((this.checkOutDate - this.checkInDate) / (1000 * 60 * 60 * 24));
});

// Auto-set payment date when payment is successful
bookingSchema.pre("save", function (next) {
  if (this.paymentStatus === "paid" && !this.paymentDate) {
    this.paymentDate = new Date();
  }
  next();
});

// Prevent overlapping bookings for the same room
bookingSchema.pre("save", async function (next) {
  if (this.status === "cancelled") {
    return next(); // Skip validation for cancelled bookings
  }

  const existingBooking = await mongoose.model("Booking").findOne({
    room: this.room,
    checkInDate: {
      $lt: this.checkOutDate
    },
    checkOutDate: {
      $gt: this.checkInDate
    },
    status: {
      $ne: "cancelled"
    }
  });

  if (existingBooking) {
    return next(new Error("This room is already booked for the selected dates."));
  }
  next();
});

// Plugin for pagination
bookingSchema.plugin(mongoosePaginate);

const Booking = mongoose.model("Booking", bookingSchema);

export {
  Booking
};
