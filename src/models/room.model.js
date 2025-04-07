import mongoose, {Schema} from "mongoose";

const roomSchema = new Schema({
  // Reference to the Service (e.g., hotel or lodge)
  service: {
    type: Schema.Types.ObjectId,
    ref: "Service",
    required: true
  },

  // Room details
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100, // Limit the length of the room name
    unique: true // Ensure room names are unique
  },

  // Room type (e.g., single, double, suite)
  roomType: {
    type: String,
    enum: [
      "single", "double", "suite", "other"
    ],
    required: true
  },

  // Pricing details
  pricePerNight: {
    type: Number,
    required: true,
    min: [0, "Price per night cannot be negative."]
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
roomSchema.index({service: 1}); // Index for service reference
roomSchema.index({roomType: 1}); // Index for room type

const Room = mongoose.model("Room", roomSchema);

export {
  Room
};
