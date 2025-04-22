import mongoose, {Schema} from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const adminSchema = new Schema({
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
    minlength: 8
  },
  refreshToken: {
    type: String,
    select: false // Never returned in queries unless explicitly requested
  },
  role: {
    type: String,
    enum: [
      "superadmin", "admin", "moderator"
    ],
    default: "admin"
  },
  permissions: {
    // ... (keep your existing permissions structure)
  },
  lastLogin: Date,
  loginIP: String,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  strict: true
});

// Password hashing middleware (keep existing)
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) 
    return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
adminSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// Generate access token method (keep existing)
adminSchema.methods.generateAccessToken = function () {
  return jwt.sign({
    _id: this._id,
    role: this.role,
    email: this.email
  }, process.env.ADMIN_JWT_SECRET, {
    expiresIn: process.env.ADMIN_ACCESS_TOKEN_EXPIRY || "15m"
  });
};

// NEW: Generate refresh token method
adminSchema.methods.generateRefreshToken = function () {
  return jwt.sign({
    _id: this._id
  }, process.env.ADMIN_REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.ADMIN_REFRESH_TOKEN_EXPIRY || "7d"
  });
};

const Admin = mongoose.model("Admin", adminSchema);

export {
  Admin
};
