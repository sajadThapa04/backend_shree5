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
  name: {
    type: String,
    required: [
      true, "Restaurant name is required."
    ],
    trim: true,
    maxlength: [
      100, "Restaurant name cannot exceed 100 characters."
    ],
    lowercase: true,
    unique: true // Ensure restaurant names are unique
  },

  // Cuisine Type (e.g., Nepali, Indian, Italian, Chinese)
  cuisineType: [
    {
      type: String,
      trim: true,
      required: [
        true, "Cuisine type is required."
      ],
      minlength: [2, "Cuisine type must have at least 2 characters."]
    }
  ],

  // Pricing Per Meal
  pricePerMeal: {
    type: Number,
    required: [
      true, "Price per meal is required."
    ],
    min: [0, "Price per meal cannot be negative."]
  },

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

  // Day-specific Opening and Closing Times
  openingHours: {
    monday: {
      openingTime: {
        type: String,
        required: [
          true, "Monday opening time is required."
        ],
        match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Opening time must be in HH:mm format (e.g., 08:00)."]
      },
      closingTime: {
        type: String,
        required: [
          true, "Monday closing time is required."
        ],
        match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Closing time must be in HH:mm format (e.g., 22:00)."]
      }
    },
    tuesday: {
      openingTime: {
        type: String,
        required: [
          true, "Tuesday opening time is required."
        ],
        match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Opening time must be in HH:mm format (e.g., 08:00)."]
      },
      closingTime: {
        type: String,
        required: [
          true, "Tuesday closing time is required."
        ],
        match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Closing time must be in HH:mm format (e.g., 22:00)."]
      }
    },
    wednesday: {
      openingTime: {
        type: String,
        required: [
          true, "Wednesday opening time is required."
        ],
        match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Opening time must be in HH:mm format (e.g., 08:00)."]
      },
      closingTime: {
        type: String,
        required: [
          true, "Wednesday closing time is required."
        ],
        match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Closing time must be in HH:mm format (e.g., 22:00)."]
      }
    },
    thursday: {
      openingTime: {
        type: String,
        required: [
          true, "Thursday opening time is required."
        ],
        match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Opening time must be in HH:mm format (e.g., 08:00)."]
      },
      closingTime: {
        type: String,
        required: [
          true, "Thursday closing time is required."
        ],
        match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Closing time must be in HH:mm format (e.g., 22:00)."]
      }
    },
    friday: {
      openingTime: {
        type: String,
        required: [
          true, "Friday opening time is required."
        ],
        match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Opening time must be in HH:mm format (e.g., 08:00)."]
      },
      closingTime: {
        type: String,
        required: [
          true, "Friday closing time is required."
        ],
        match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Closing time must be in HH:mm format (e.g., 22:00)."]
      }
    },
    saturday: {
      openingTime: {
        type: String,
        required: [
          true, "Saturday opening time is required."
        ],
        match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Opening time must be in HH:mm format (e.g., 08:00)."]
      },
      closingTime: {
        type: String,
        required: [
          true, "Saturday closing time is required."
        ],
        match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Closing time must be in HH:mm format (e.g., 22:00)."]
      }
    },
    sunday: {
      openingTime: {
        type: String,
        required: [
          true, "Sunday opening time is required."
        ],
        match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Opening time must be in HH:mm format (e.g., 08:00)."]
      },
      closingTime: {
        type: String,
        required: [
          true, "Sunday closing time is required."
        ],
        match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Closing time must be in HH:mm format (e.g., 22:00)."]
      }
    }
  },

  // Image URLs
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

// Create and export the model
const Restaurant = mongoose.model("Restaurant", restaurantSchema);

export {
  Restaurant
};
