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
    maxlength: 100
  },

  // Type of service
  type: {
    type: String,
    enum: [
      "restaurant",
      "hotel",
      "lodge",
      "home_stay",
      "luxury_villa",
      "other"
    ],
    required: true
  },

  // Address details (added from Host model)
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

  // Capacity details
  // capacity: {
  //   type: Number,
  //   required: true,
  //   min: [1, "Capacity must be at least 1."]
  // },

  //  Amenities
  // amenities: [
  //   {
  //     type: String,
  //     trim: true
  //   }
  // ],

  //  Images
  // images: [
  //   {
  //     type: String,
  //     trim: true
  //   }
  // ],

  // Availability
  isAvailable: {
    type: Boolean,
    default: true
  }
}, {timestamps: true});

// Indexes
serviceSchema.index({host: 1});
serviceSchema.index({type: 1});
serviceSchema.index({"address.coordinates": "2dsphere"});
serviceSchema.index({
  name: 1,
  "address.city": 1
}, {unique: true});
// we are chaning the name from unique true to using
//  this schema so that we will allow allow duplicate service names but only across different cities.

const Service = mongoose.model("Service", serviceSchema);

export {
  Service
};
