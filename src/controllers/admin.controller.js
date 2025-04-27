import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {Host} from "../models/host.model.js";
import {Admin} from "../models/admin.models.js";
import {User} from "../models/user.model.js";
import mongoose from "mongoose";
import {isPasswordStrong, isEmailValid, areRequiredFieldsProvided} from "../utils/validator.js";
import logger from "../utils/logger.js";

const createSuperadmin = asyncHandler(async (req, res) => {
  const {fullName, email, password} = req.body;

  // Check if any superadmin already exists
  const existingSuperadmin = await Admin.findOne({role: "superadmin"});
  if (existingSuperadmin) {
    throw new ApiError(403, "Superadmin already exists");
  }

  // Create superadmin
  const superadmin = await Admin.create({
    fullName,
    email,
    password,
    role: "superadmin",
    permissions: {
      manageUsers: true,
      manageHosts: true,
      manageContent: true,
      manageSettings: true
    }
  });

  res.status(201).json(new ApiResponse(201, superadmin, "Initial superadmin created"));
});
// Superadmin-only: Create new admin account
const createAdmin = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    logger.info("Starting createAdmin process");

    // 1. Authorization Check
    if (req.admin.role !== "superadmin") {
      logger.error("Unauthorized: Only superadmin can create admin accounts");
      throw new ApiError(403, "Unauthorized: Only superadmin can create admin accounts");
    }

    const {fullName, email, password, role} = req.body;

    // 2. Input Validation
    if (!areRequiredFieldsProvided([fullName, email, password, role])) {
      logger.error("Missing required fields");
      throw new ApiError(400, "All fields (fullName, email, password, role) are required");
    }

    if (!isEmailValid(email)) {
      logger.error("Invalid email format");
      throw new ApiError(400, "Invalid email format");
    }

    if (!isPasswordStrong(password)) {
      logger.error("Password does not meet strength requirements");
      throw new ApiError(400, "Password must be at least 8 characters with uppercase, lowercase, number, and special character");
    }

    // 3. Role Validation
    const validRoles = ["admin", "moderator"]; // Explicitly excluding superadmin
    if (!validRoles.includes(role)) {
      logger.error("Invalid admin role");
      throw new ApiError(400, `Role must be one of: ${validRoles.join(", ")}`);
    }

    // 4. Check for Existing Admin
    const existingAdmin = await Admin.findOne({email}).session(session);
    if (existingAdmin) {
      logger.error("Email already in use");
      throw new ApiError(409, "Email already in use by another admin");
    }

    // 5. Create Admin with Default Permissions
    const admin = await Admin.create([
      {
        fullName,
        email,
        password,
        role,
        permissions: {
          manageUsers: role === "admin",
          manageHosts: true,
          manageContent: true,
          manageSettings: role === "admin"
        }
      }
    ], {session});

    // 6. Save and Commit Transaction
    await admin[0].save({session});
    await session.commitTransaction();

    // 7. Prepare Response (Exclude Sensitive Data)
    const createdAdmin = await Admin.findById(admin[0]._id).select("-password -refreshToken").session(session);

    if (!createdAdmin) {
      logger.error("Failed to create admin");
      throw new ApiError(500, "Failed to create admin account");
    }

    logger.info(`Admin account created successfully for ${email}`);

    res.status(201).json(new ApiResponse(201, createdAdmin, "Admin account created successfully"));
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error in createAdmin: ${error.message}`, {stack: error.stack});

    if (error instanceof ApiError) {
      throw error;
    }
    if (error.name === "ValidationError") {
      throw new ApiError(400, error.message);
    }
    if (error.code === 11000) {
      throw new ApiError(409, "Admin with this email already exists");
    }
    throw new ApiError(500, error.message || "Failed to create admin account");
  } finally {
    session.endSession();
  }
});

// Admin Login Controller
const loginAdmin = asyncHandler(async (req, res) => {
  const {email, password} = req.body;

  try {
    logger.info("Starting admin login process");

    // 1. Input Validation
    if (!email || !password) {
      logger.error("Email and password are required");
      throw new ApiError(400, "Email and password are required");
    }

    if (!isEmailValid(email)) {
      logger.error("Invalid email format");
      throw new ApiError(400, "Invalid email format");
    }

    // 2. Find Admin (include refreshToken)
    const admin = await Admin.findOne({email}).select("+refreshToken");
    if (!admin) {
      logger.error("Admin not found with this email");
      throw new ApiError(404, "Admin not found");
    }

    // 3. Check if account is active
    if (!admin.isActive) {
      logger.error("Admin account is inactive");
      throw new ApiError(403, "Admin account is inactive. Please contact superadmin.");
    }

    // 4. Verify Password
    const isPasswordValid = await admin.comparePassword(password);
    if (!isPasswordValid) {
      logger.error("Invalid credentials");
      throw new ApiError(401, "Invalid credentials");
    }

    // 5. Generate Tokens
    const accessToken = admin.generateAccessToken();
    const refreshToken = admin.generateRefreshToken();

    // 6. Save refresh token to database
    admin.refreshToken = refreshToken;
    admin.lastLogin = new Date();
    admin.loginIP = req.ip;
    await admin.save({validateBeforeSave: false});

    // 7. Prepare response (exclude sensitive data)
    const loggedInAdmin = await Admin.findById(admin._id).select("-password -refreshToken");

    // 8. Set cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict"
    };

    res.status(200).cookie("adminAccessToken", accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000 // 15 minutes
    }).cookie("adminRefreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }).json(new ApiResponse(200, {
      admin: loggedInAdmin,
      accessToken,
      refreshToken
    }, "Admin logged in successfully"));

    logger.info(`Admin ${email} logged in successfully`);
  } catch (error) {
    logger.error(`Error in loginAdmin: ${error.message}`, {stack: error.stack});
    throw error;
  }
});

//refresh token controller
const refreshAdminToken = asyncHandler(async (req, res) => {
  try {
    const incomingRefreshToken = req.cookies
      ?.adminRefreshToken || req.body
        ?.refreshToken;

    if (!incomingRefreshToken) {
      throw new ApiError(401, "Unauthorized request - No refresh token");
    }

    // Verify the refresh token
    const decodedToken = jwt.verify(incomingRefreshToken, process.env.ADMIN_REFRESH_TOKEN_SECRET);

    // Find admin with refresh token
    const admin = await Admin.findById(decodedToken._id).select("+refreshToken");
    if (!admin) {
      throw new ApiError(401, "Invalid refresh token");
    }

    // Verify token matches stored token
    if (incomingRefreshToken !== admin.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    // Generate new tokens
    const newAccessToken = admin.generateAccessToken();
    const newRefreshToken = admin.generateRefreshToken();

    // Update refresh token in database
    admin.refreshToken = newRefreshToken;
    await admin.save({validateBeforeSave: false});

    // Set cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict"
    };

    res.status(200).cookie("adminAccessToken", newAccessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000 // 15 minutes
    }).cookie("adminRefreshToken", newRefreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }).json(new ApiResponse(200, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    }, "Access token refreshed"));
  } catch (error) {
    throw new ApiError(
      401, error
      ?.message || "Invalid refresh token");
  }
});

// Admin Logout Controller
const logoutAdmin = asyncHandler(async (req, res) => {
  try {
    logger.info("Starting admin logout process");

    // Clear the cookie
    res.clearCookie("adminAccessToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict"
    });

    res.status(200).json(new ApiResponse(200, {}, "Admin logged out successfully"));
    logger.info(`Admin ${req.admin.email} logged out successfully`);
  } catch (error) {
    logger.error(`Error in logoutAdmin: ${error.message}`, {stack: error.stack});
    throw new ApiError(500, "Failed to logout admin");
  }
});

// Admin-only: Update host status
const updateHostStatus = asyncHandler(async (req, res) => {
  try {
    logger.info("Starting updateHostStatus process");

    const {hostId} = req.params;
    const {status} = req.body;

    // Validate host ID
    if (!mongoose.Types.ObjectId.isValid(hostId)) {
      logger.error("Invalid host ID");
      throw new ApiError(400, "Invalid host ID");
    }

    // Validate status
    const allowedStatuses = ["active", "inactive", "pending", "rejected"];
    if (!status || !allowedStatuses.includes(status)) {
      logger.error("Invalid status value");
      throw new ApiError(400, `Status must be one of: ${allowedStatuses.join(", ")}`);
    }

    // Find and update the host
    const host = await Host.findByIdAndUpdate(hostId, {
      status
    }, {
      new: true,
      runValidators: true
    });

    if (!host) {
      logger.error("Host not found");
      throw new ApiError(404, "Host not found");
    }

    // If status is rejected, send notification to user (implementation depends on your notification system)
    if (status === "rejected") {
      // You might want to add a rejection reason field and send it to the user
      logger.info(`Host ${hostId} has been rejected`);
    }

    // If status is active, ensure the user has host role
    if (status === "active") {
      const user = await User.findById(host.user);
      if (user && user.role !== "host") {
        await User.findByIdAndUpdate(host.user, {role: "host"});
        logger.info(`Updated user ${host.user} role to host`);
      }
    }

    logger.info(`Host status updated to ${status} successfully`);

    res.status(200).json(new ApiResponse(200, host, `Host status updated to ${status} successfully`));
  } catch (error) {
    logger.error(`Error in updateHostStatus: ${error.message}`, {stack: error.stack});

    if (error instanceof ApiError) {
      throw error;
    }
    if (error.name === "CastError") {
      throw new ApiError(400, "Invalid host ID");
    }
    if (error.name === "ValidationError") {
      throw new ApiError(400, error.message);
    }
    throw new ApiError(500, error.message || "Failed to update host status");
  }
});

// Admin-only: Get all hosts with filtering by status
const getAllHostsByStatus = asyncHandler(async (req, res) => {
  try {
    logger.info("Starting getAllHostsByStatus process");

    const {status} = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    // Validate page and limit
    if (page < 1 || limit < 1) {
      logger.error("Invalid page or limit");
      throw new ApiError(400, "Page and limit must be positive integers");
    }

    // Build filter
    const filter = {};
    if (status) {
      const allowedStatuses = ["active", "inactive", "pending", "rejected"];
      if (!allowedStatuses.includes(status)) {
        logger.error("Invalid status filter");
        throw new ApiError(400, `Status must be one of: ${allowedStatuses.join(", ")}`);
      }
      filter.status = status;
    }

    // Get hosts with pagination
    const options = {
      page,
      limit,
      sort: {
        createdAt: -1
      },
      populate: {
        path: "user",
        select: "fullName email profileImage"
      }
    };

    const hosts = await Host.paginate(filter, options);

    if (!hosts || hosts.docs.length === 0) {
      logger.info("No hosts found with the specified criteria");
      return res.status(200).json(new ApiResponse(200, {
        hosts: []
      }, "No hosts found with the specified criteria"));
    }

    logger.info("Hosts fetched successfully by status");

    res.status(200).json(new ApiResponse(200, hosts, "Hosts fetched successfully by status"));
  } catch (error) {
    logger.error(`Error in getAllHostsByStatus: ${error.message}`, {stack: error.stack});

    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, error.message || "Failed to fetch hosts by status");
  }
});

// Admin-only: Delete admin account (Superadmin only)
const deleteAdmin = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    logger.info("Starting deleteAdmin process");

    const {adminId} = req.params;

    // 1. Authorization Check
    if (req.admin.role !== "superadmin") {
      logger.error("Unauthorized: Only superadmin can delete admin accounts");
      throw new ApiError(403, "Unauthorized: Only superadmin can delete admin accounts");
    }

    // 2. Validate admin ID
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      logger.error("Invalid admin ID");
      throw new ApiError(400, "Invalid admin ID");
    }

    // 3. Prevent self-deletion
    if (adminId === req.admin._id.toString()) {
      logger.error("Superadmin cannot delete themselves");
      throw new ApiError(400, "Superadmin cannot delete themselves");
    }

    // 4. Find and delete admin
    const adminToDelete = await Admin.findByIdAndDelete(adminId).session(session);

    if (!adminToDelete) {
      logger.error("Admin not found");
      throw new ApiError(404, "Admin not found");
    }

    // 5. Commit transaction
    await session.commitTransaction();
    logger.info(`Admin ${adminToDelete.email} deleted successfully`);

    res.status(200).json(new ApiResponse(200, {}, "Admin account deleted successfully"));
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error in deleteAdmin: ${error.message}`, {stack: error.stack});

    if (error instanceof ApiError) {
      throw error;
    }
    if (error.name === "CastError") {
      throw new ApiError(400, "Invalid admin ID");
    }
    throw new ApiError(500, error.message || "Failed to delete admin account");
  } finally {
    session.endSession();
  }
});

export {
  createSuperadmin,
  createAdmin,
  loginAdmin,
  logoutAdmin,
  updateHostStatus,
  getAllHostsByStatus,
  refreshAdminToken,
  deleteAdmin
};
