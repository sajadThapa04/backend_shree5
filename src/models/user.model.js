import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const userSchema = new Schema({
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  phone: {
    type: String,
    required: true,
    unique: true
  },
  role: {
    type: String,
    enum: [
      "traveler", "host"
    ], // Only traveler and host roles
    default: "traveler"
  },
  profileImage: {
    type: String,
    default: "default-profile.png"
  },
  address: {
    country: String,
    city: String,
    street: String
  },
  status: {
    type: String,
    enum: [
      "active", "inactive", "banned", "pending"
    ],
    default: "active"
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },

  //phone verification field
  phoneVerificationToken: {
    type: String
  },
  phoneVerificationExpires: {
    type: Date
  },
  phoneVerificationAttempts: {
    type: Number,
    default: 0
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String
  },
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpires: {
    type: Date
  },
  savedListings: [
    {
      type: Schema.Types.ObjectId,
      ref: "Host"
    }
  ],
  
  hostProfile: {
    type: Schema.Types.ObjectId,
    ref: "Host"
  },
  twoFactorAuth: {
    isEnabled: {
      type: Boolean,
      default: false
    },
    secret: String
  },
  Booking: [
    {
      type: Schema.Types.ObjectId,
      ref: "Booking"
    }
  ],
  refreshToken: {
    type: String
  }
}, { timestamps: true });

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password"))
    return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// Generate access token
userSchema.methods.generateAccessToken = function () {
  return jwt.sign({
    _id: this._id,
    email: this.email,
    fullName: this.fullName
  }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "1d"
  });
};

// Generate refresh token
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign({
    _id: this._id
  }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d"
  });
};

const User = mongoose.model("User", userSchema);

export {
  User
};
