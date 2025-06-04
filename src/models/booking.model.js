import mongoose, {Schema} from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const booking = new Schema({
  // Reference to the User who made the booking (optional for guest bookings)
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: function () {
      // Only required if there's no guestInfo object at all
      return !(this.guestInfo && (this.guestInfo.fullName || this.guestInfo.email));
    },
    validate: {
      validator: function (v) {
        // Only validate if guestInfo has actual values
        const hasGuestInfo = this.guestInfo && (this.guestInfo.fullName || this.guestInfo.email);
        return !(hasGuestInfo && v);
      },
      message: "Booking cannot have both user and guest information"
    }
  },

  // Information for guest bookings (optional for registered users)
  guestInfo: {
    fullName: {
      type: String,
      required: function () {
        // Only required if there's no user
        return !this.user;
      },
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"]
    },
    email: {
      type: String,
      required: function () {
        // Only required if there's no user
        return !this.user;
      },
      trim: true,
      lowercase: true,
      validate: {
        validator: function (v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: "Please enter a valid email address"
      }
    },
    phone: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^\+?[\d\s-]{10,}$/.test(v);
        },
        message: "Please enter a valid phone number"
      }
    }
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
  room: {
    type: Schema.Types.ObjectId,
    ref: "Room",
    required: true
  },

  // Booking dates
  checkInDate: {
    type: Date,
    required: true,
    validate: {
      validator: function (value) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to midnight

        const checkInDate = new Date(value);
        checkInDate.setHours(0, 0, 0, 0);

        return checkInDate >= today;
      },
      message: "Check-in date cannot be in the past."
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
  },

  // Track booking source (web, mobile, guest, etc.)
  bookingSource: {
    type: String,
    enum: [
      "web", "mobile", "agent", "walk-in"
    ],
    default: "web"
  }
}, {timestamps: true});

// Add indexing for better performance
booking.index({user: 1});
booking.index({"guestInfo.email": 1});
booking.index({host: 1});
booking.index({room: 1});
booking.index({status: 1});
booking.index({paymentStatus: 1});

// Virtual field for booking duration (in days)
booking.virtual("duration").get(function () {
  return Math.ceil((this.checkOutDate - this.checkInDate) / (1000 * 60 * 60 * 24));
});

// Virtual field to get booking user's name (either registered user or guest)
booking.virtual("customerName").get(function () {
  return this.user
    ?.fullName || this.guestInfo
      ?.fullName;
});

// Auto-set payment date when payment is successful
booking.pre("save", function (next) {
  if (this.paymentStatus === "paid" && !this.paymentDate) {
    this.paymentDate = new Date();
  }
  next();
});

// Prevent overlapping bookings for the same room
booking.pre("save", async function (next) {
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
    },
    _id: {
      $ne: this._id
    } // Exclude current booking when updating
  });

  if (existingBooking) {
    return next(new Error("This room is already booked for the selected dates."));
  }
  next();
});

// Validate that either user or guestInfo is provided
booking.pre("validate", function (next) {
  if (!this.user && !this.guestInfo) {
    return next(new Error("Booking must be associated with either a registered user or include guest information."));
  }
  next();
});

// Plugin for pagination
booking.plugin(mongoosePaginate);

const Booking = mongoose.model("Booking", booking);

export {
  Booking
};
