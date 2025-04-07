import mongoose, {Schema} from "mongoose";

const serviceSchema = new Schema({
  // Reference to the Host
  host: {
    type: Schema.Types.ObjectId,
    ref: "Host",
    required: true
  },

  // Service details
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100 // Limit the length of the service name
  },

  // Type of service (aligned with Host's listingType)
  type: {
    type: String,
    enum: [
      "restaurant", // Dining places
      "hotel", // Hotel accommodations
      "lodge", // Basic accommodations
      "home_stay", // Private homes for rent
      "luxury_villa", // High-end accommodations
      "other" // Generic fallback
    ],
    required: true
  },

  // Capacity details
  capacity: {
    type: Number,
    required: true,
    min: [1, "Capacity must be at least 1."]
  },

  // Amenities
  amenities: [
    {
      type: String,
      trim: true
    }
  ],

  // Images
  images: [
    {
      type: String, // URLs to images
      trim: true
    }
  ],

  // Availability
  isAvailable: {
    type: Boolean,
    default: true
  }
}, {timestamps: true});

// Index for efficient querying
serviceSchema.index({host: 1}); // Index for host reference
serviceSchema.index({type: 1}); // Index for service type

const Service = mongoose.model("Service", serviceSchema);

export {
  Service
};
