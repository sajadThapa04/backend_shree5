import mongoose, {Schema} from "mongoose";

const restaurantSchema = new Schema({
  // Reference to the Service
  service: {
    type: Schema.Types.ObjectId,
    ref: "Service",
    required: [
      true, "Service reference is required."
    ],
    index: true // Index for faster lookups
  },

  // Restaurant Name
  //commenting this line we are using it from the services field
  // name: {
  //   type: String,
  //   required: [
  //     true, "Restaurant name is required."
  //   ],
  //   trim: true,
  //   maxlength: [
  //     100, "Restaurant name cannot exceed 100 characters."
  //   ],
  //   lowercase: true,
  //   unique: true  Ensure restaurant names are unique
  // },

  // Cuisine Details with individual prices and images
  cuisineDetails: [
    {
      name: {
        type: String,
        trim: true,
        required: [
          true, "Cuisine name is required."
        ],
        minlength: [
          2, "Cuisine name must have at least 2 characters."
        ],
        lowercase: true
      },
      price: {
        type: Number,
        required: [
          true, "Price is required for each cuisine."
        ],
        min: [0, "Price cannot be negative."]
      },
      image: {
        type: String,
        trim: true,
        match: [/^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))$/i, "Image URL must be valid and end with png, jpg, jpeg, gif, or webp."]
      }
    }
  ],

  // Seating Capacity
  seatingCapacity: {
    type: Number,
    required: [
      true, "Seating capacity is required."
    ],
    min: [1, "Seating capacity must be at least 1."]
  },

  // List of Amenities (WiFi, AC, etc.)
  amenities: [
    {
      type: String,
      trim: true,
      lowercase: true
    }
  ],

  // Day-specific Opening and Closing Times as an array
  openingHours: [
    {
      day: {
        type: String,
        enum: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday"
        ],
        required: true
      },
      timeSlots: [
        {
          openingTime: {
            type: String,
            required: true,
            match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Opening time must be in HH:mm format."]
          },
          closingTime: {
            type: String,
            required: true,
            match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Closing time must be in HH:mm format."]
          }
        }
      ]
    }
  ],
  // General Image URLs (for the restaurant as a whole)
  images: [
    {
      type: String,
      trim: true,
      match: [/^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))$/i, "Image URL must be valid and end with png, jpg, jpeg, gif, or webp."]
    }
  ],

  // Availability Status
  isAvailable: {
    type: Boolean,
    default: true,
    index: true // Index for better querying
  }
}, {timestamps: true});


restaurantSchema.virtual("serviceName", {
  ref: "Service",
  localField: "service",
  foreignField: "_id",
  justOne: true
});

// Create and export the model
const Restaurant = mongoose.model("Restaurant", restaurantSchema);

export {
  Restaurant
};