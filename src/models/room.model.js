import mongoose, {Schema} from "mongoose";

const roomSchema = new Schema({
  // Reference to the Service (e.g., hotel, lodge, villa, homestay)
  service: {
    type: Schema.Types.ObjectId,
    ref: "Service",
    required: [true, "Service reference is required"]
  },

  // Room details
  name: {
    type: String,
    required: [
      true, "Room name is required"
    ],
    trim: true,
    maxlength: [100, "Room name cannot exceed 100 characters"]
  },

  // Room type with expanded enum values
  roomType: {
    type: String,
    enum: [
      "single",
      "double",
      "twin",
      "triple",
      "queen",
      "king",
      "family",
      "suite",
      "presidential",
      "dormitory",
      "cottage",
      "tent",
      "penthouse",
      "honeymoon",
      "studio",
      "shared",
      "private",
      "entire_home",
      "other"
    ],
    required: [true, "Room type is required"]
  },

  // Detailed description
  description: {
    type: String,
    trim: true,
    maxlength: [2000, "Description cannot exceed 2000 characters"]
  },

  // Day-specific availability with time slots
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
            match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Opening time must be in HH:mm format"]
          },
          closingTime: {
            type: String,
            required: true,
            match: [/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, "Closing time must be in HH:mm format"]
          }
        }
      ]
    }
  ],

  // Pricing details
  pricePerNight: {
    type: Number,
    required: [
      true, "Price per night is required"
    ],
    min: [0, "Price per night cannot be negative"]
  },

  // Capacity details
  capacity: {
    adults: {
      type: Number,
      required: [
        true, "Adult capacity is required"
      ],
      min: [1, "Must accommodate at least 1 adult"]
    },
    children: {
      type: Number,
      default: 0,
      min: [0, "Children capacity cannot be negative"]
    }
  },

  // Track booked dates
  bookedDates: [
    {
      checkInDate: {
        type: Date,
        required: true
      },
      checkOutDate: {
        type: Date,
        required: true
      },
      booking: {
        type: Schema.Types.ObjectId,
        ref: "Booking"
      }
    }
  ],
  // Room features
  size: {
    type: Number,
    min: [0, "Room size cannot be negative"]
  },
  floorNumber: {
    type: Number,
    min: [0, "Floor number cannot be negative"]
  },
  bedType: {
    type: String,
    enum: [
      "king",
      "queen",
      "double",
      "single",
      "bunk",
      "floor_mattress",
      "other"
    ],
    default: "queen"
  },
  bathroomType: {
    type: String,
    enum: [
      "shared", "private", "ensuite"
    ],
    default: "private"
  },

  // Searchable tags
  tags: [
    {
      type: String,
      trim: true,
      lowercase: true
    }
  ],

  // Amenities
  amenities: [
    {
      type: String,
      trim: true,
      lowercase: true
    }
  ],

  // Images
  images: [
    {
      type: String,
      trim: true,
      match: [/^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))$/i, "Image URL must be valid and end with png, jpg, jpeg, gif, or webp."]
    }
  ],

  accommodationImages: [
    {
      type: String,
      trim: true,
      match: [/^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))$/i, "Image URL must be valid and end with png, jpg, jpeg, gif, or webp."]
    }
  ],
  // Availability
  isAvailable: {
    type: Boolean,
    default: true
  },

  // For future pricing flexibility
  pricingModel: {
    type: String,
    enum: [
      "static", "dynamic"
    ],
    default: "static"
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

// Indexes for efficient querying (consolidated here)
roomSchema.index({service: 1});
roomSchema.index({roomType: 1});
roomSchema.index({isAvailable: 1});
roomSchema.index({tags: 1});
roomSchema.index({amenities: 1});
roomSchema.index({"images.isFeatured": 1});

// Virtual for total capacity
roomSchema.virtual("totalCapacity").get(function () {
  return this.capacity.adults + this.capacity.children;
});

const Room = mongoose.model("Room", roomSchema);

export {
  Room
};
