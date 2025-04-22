import mongoose, {Schema} from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const hostSchema = new Schema({
  // Reference to the User who owns this host profile
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // Type of listing (e.g., restaurant, hotel, lodge)
  // listingType: {
  //   type: String,
  //   enum: [
  //     "restaurant", "hotel", "lodge", "home_stay", "luxury_villa"
  //   ],
  //   required: true
  // },
  // Basic details
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100 // Limit the length of the name
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000 // added 5000 characters limit
  },
  // Location details
  address: {
    country: {
      type: String,
      required: true,
      trim: true
    },
    city: {
      type: String,
      required: true,
      trim: true
    },
    street: {
      type: String,
      required: true,
      trim: true
    },
    zipCode: {
      type: String,
      trim: true
    },
    coordinates: {
      // For geolocation (latitude and longitude)
      type: {
        type: String,
        default: "Point"
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        validate: {
          validator: function (coords) {
            return (Array.isArray(coords) && coords.length === 2 && typeof coords[0] === "number" && typeof coords[1] === "number");
          },
          message: "Coordinates must be an array of [longitude, latitude]"
        }
      }
    }
  },
  // Contact information
  phone: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    validate: {
      validator: function (phone) {
        // Basic phone number validation (adjust regex as needed)
        return /^\+?[0-9]{10,15}$/.test(phone);
      },
      message: "Invalid phone number"
    }
  },
  email: {
    type: String,
    unique: true,
    required: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function (email) {
        // Basic email validation
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: "Invalid email address"
    }
  },
  // Policies (e.g., cancellation policy)
  policies: {
    cancellation: {
      type: String,
      enum: [
        "flexible", "moderate", "strict"
      ],
      default: "moderate"
    }
  },
  // Status of the listing
  status: {
    type: String,
    enum: [
      "active", "inactive", "pending", "rejected"
    ],
    default: "pending"
  },
  // Additional metadata
  isFeatured: {
    type: Boolean,
    default: false
  },
  featuredUntil: {
    type: Date // If the listing is featured, until when
  }
}, {timestamps: true});

// Index for geolocation (to enable location-based queries)
hostSchema.index({"address.coordinates": "2dsphere"});

// Plugin for pagination
hostSchema.plugin(mongoosePaginate);

const Host = mongoose.model("Host", hostSchema);

export {
  Host
};
