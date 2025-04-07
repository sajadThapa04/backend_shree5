import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {User} from "../models/user.model.js";
import jwt from "jsonwebtoken";
import {sendVerificationEmail, sendPasswordResetEmail} from "../utils/emailService.js";
import {isPasswordStrong, isEmailValid, isPhoneValid, areRequiredFieldsProvided, isStringEmpty} from "../utils/validator.js";
import mongoose from "mongoose";
import {uploadOnCloudinary, deleteFromCloudinary} from "../utils/cloudinary.js";
import logger from "../utils/logger.js";
import {sendVerificationSMS, generateVerificationCode, sendWhatsAppVerification, sendWhatsAppMessage} from "../utils/twilioService.js";

// Generate access and refresh tokens
const generateAccessAndRefreshToken = async userId => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save({validateBeforeSave: false});
    return {accessToken, refreshToken};
  } catch (error) {
    logger.error(`Error in generateAccessAndRefreshToken: ${error.message}`, {stack: error.stack});
    throw new ApiError(500, "Failed to generate access and refresh tokens");
  }
};

// Register a new user
const registerUser = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession(); // Start a MongoDB session for transactions
  session.startTransaction();

  try {
    logger.info("Starting registerUser process");

    const {fullName, email, password, phone} = req.body;

    // Step 1: Validate input fields
    if (!areRequiredFieldsProvided([fullName, email, password, phone])) {
      logger.error("Missing required fields");
      throw new ApiError(400, "Please provide all required fields: fullName, email, password, phone");
    }

    // Step 2: Validate email format
    if (!isEmailValid(email)) {
      logger.error("Invalid email format");
      throw new ApiError(400, "Invalid email format");
    }

    // Step 3: Validate phone number
    if (!isPhoneValid(phone)) {
      logger.error("Invalid phone number");
      throw new ApiError(400, "Invalid phone number");
    }

    // Step 4: Validate password strength
    if (!isPasswordStrong(password)) {
      logger.error("Password is too weak");
      throw new ApiError(400, "Password is too weak. It must contain at least one uppercase letter, one lowercase letter, one digit, and one special character.");
    }

    // Step 5: Set default role to "traveler"
    const userRole = "traveler"; // Default role

    // Step 6: Check if user email already exists
    const existingUser = await User.findOne({email}).session(session); // Use the session for transaction consistency
    if (existingUser) {
      logger.error("Email already exists");
      throw new ApiError(409, "Email already exists. Please log in or use a different email");
    }

    //check if the user Phone no already exists
    const existingPhoneNo = await User.findOne({phone}).session(session); // Use the session for transaction consistency
    if (existingPhoneNo) {
      logger.error("Phone number already exists");
      throw new ApiError(409, "Phone number already exists. Please use a different Phone Number");
    }

    // Step 7: Create new user
    const user = await User.create([
      {
        fullName,
        email,
        password,
        phone,
        role: userRole
      }
    ], {session}); // Use the session for transaction consistency

    // Step 8: Generate verification token
    const verificationToken = user[0].generateAccessToken();
    user[0].verificationToken = verificationToken;
    await user[0].save({validateBeforeSave: false, session}); // Use the session for transaction consistency

    // Step 9: Send verification email
    await sendVerificationEmail(email, verificationToken);

    // Commit the transaction
    await session.commitTransaction();

    // Step 10: Return response (excluding sensitive fields)
    const createdUser = await User.findById(user[0]._id).select("-password -refreshToken -verificationToken");

    if (!createdUser) {
      logger.error("Failed to create user");
      throw new ApiError(500, "Failed to create user");
    }

    logger.info("User registered successfully");

    res.status(201).json(new ApiResponse(201, createdUser, "User registered successfully. Please check your email to verify your account."));
  } catch (error) {
    // Abort the transaction in case of any error
    await session.abortTransaction();

    logger.error(`Error in registerUser: ${error.message}`, {stack: error.stack});

    // Handle specific errors
    if (error instanceof ApiError) {
      throw error; // Re-throw custom API errors
    }
    // Handle Mongoose validation errors
    if (error.name === "ValidationError") {
      throw new ApiError(400, error.message);
    }
    // Handle duplicate key errors (e.g., unique fields)
    if (error.code === 11000) {
      throw new ApiError(400, "Duplicate field value entered");
    }
    // Handle other errors
    throw new ApiError(500, error.message || "Failed to register user");
  } finally {
    // End the session in the finally block to ensure it's always closed
    session.endSession();
  }
});

// Verify email
const verifyEmail = asyncHandler(async (req, res) => {
  const {token} = req.query;

  if (!token) {
    logger.error("Verification token is required");
    throw new ApiError(400, "Verification token is required");
  }

  try {
    logger.info("Starting verifyEmail process");

    // Verify token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(decodedToken._id);

    if (!user) {
      logger.error("User not found");
      throw new ApiError(404, "User not found");
    }

    if (user.isEmailVerified) {
      logger.error("Email is already verified");
      throw new ApiError(400, "Email is already verified");
    }

    // Mark email as verified
    user.isEmailVerified = true;
    user.verificationToken = undefined;
    await user.save({validateBeforeSave: false});

    logger.info("Email verified successfully");

    res.status(200).json(new ApiResponse(200, {}, "Email verified successfully"));
  } catch (error) {
    logger.error(`Error in verifyEmail: ${error.message}`, {stack: error.stack});

    if (error.name === "JsonWebTokenError") {
      throw new ApiError(400, "Invalid or expired verification token");
    }
    throw error; // Re-throw other errors
  }
});

//resend verfication
const resendVerificationEmail = asyncHandler(async (req, res) => {
  const {email} = req.body;

  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  const user = await User.findOne({email});

  if (!user) {
    throw new ApiError(404, "Email is not registered please sign-up again");
  }

  if (user.isEmailVerified) {
    throw new ApiError(400, "Email is already verified");
  }

  const verificationToken = user.generateAccessToken();
  user.verificationToken = verificationToken;
  await user.save({validateBeforeSave: false});

  await sendVerificationEmail(email, verificationToken);

  res.status(200).json(new ApiResponse(200, {}, "Verification email resent successfully"));
});

// Send phone verification code
const sendPhoneVerification = asyncHandler(async (req, res) => {
  const {phone} = req.body;

  if (!phone) {
    throw new ApiError(400, "Phone number is required");
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.isPhoneVerified) {
    throw new ApiError(400, "Phone number is already verified");
  }

  // Generate and save verification code
  const verificationCode = generateVerificationCode();
  user.phoneVerificationToken = verificationCode;
  user.phoneVerificationExpires = Date.now() + 600000; // 10 minutes
  user.phoneVerificationAttempts = 0;
  await user.save({validateBeforeSave: false});

  // Send SMS
  await sendVerificationSMS(phone, verificationCode);

  res.status(200).json(new ApiResponse(200, {}, "Verification code sent to your phone"));
});

// sendWhatapp verification

//important point to be note here we are using the plural Verifications
//  on const name not Verification because it conflict with the import name
const sendWhatsAppVerifications = asyncHandler(async (req, res) => {
  const {whatsappNumber} = req.body;

  // Validation
  if (!whatsappNumber) {
    throw new ApiError(400, "WhatsApp number is required");
  }

  // Format validation
  if (!whatsappNumber.startsWith("+")) {
    throw new ApiError(400, "Number must include country code (e.g. +977...)");
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.isPhoneVerified) {
    throw new ApiError(400, "Phone number is already verified");
  }

  // Generate and save verification code
  const verificationCode = generateVerificationCode();
  user.phoneVerificationToken = verificationCode;
  user.phoneVerificationExpires = Date.now() + 600000; // 10 minutes
  user.phoneVerificationAttempts = 0;
  await user.save({validateBeforeSave: false});

  try {
    // Send via WhatsApp
    await sendWhatsAppVerification(whatsappNumber, verificationCode);

    res.status(200).json(new ApiResponse(200, {}, "Verification code sent to your WhatsApp"));
  } catch (error) {
    // Clean up on failure
    user.phoneVerificationToken = undefined;
    user.phoneVerificationExpires = undefined;
    await user.save({validateBeforeSave: false});

    logger.error(`WhatsApp verification failed: ${error.message}`);

    if (error.message.includes("not on WhatsApp")) {
      throw new ApiError(400, "This number is not registered on WhatsApp");
    }

    throw new ApiError(500, "Failed to send WhatsApp verification");
  }
});

// Verify WhatsApp code
const verifyWhatsAppCode = asyncHandler(async (req, res) => {
  const {code} = req.body;

  if (!code) {
    throw new ApiError(400, "Verification code is required");
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.isPhoneVerified) {
    throw new ApiError(400, "Phone number is already verified");
  }

  // Check if code matches
  if (user.phoneVerificationToken !== code) {
    user.phoneVerificationAttempts += 1;
    await user.save({validateBeforeSave: false});

    if (user.phoneVerificationAttempts >= 3) {
      throw new ApiError(400, "Too many attempts. Please request a new code.");
    }

    throw new ApiError(400, "Invalid verification code");
  }

  // Check if code is expired
  if (user.phoneVerificationExpires < Date.now()) {
    throw new ApiError(400, "Verification code has expired");
  }

  // Mark phone as verified
  user.isPhoneVerified = true;
  user.phoneVerificationToken = undefined;
  user.phoneVerificationExpires = undefined;
  user.phoneVerificationAttempts = 0;
  await user.save({validateBeforeSave: false});

  // Optional: Send welcome message via WhatsApp
  try {
    await sendWhatsAppMessage(user.phone, "Your account has been successfully verified!");
  } catch (error) {
    logger.error("Failed to send welcome message:", error);
  }

  res.status(200).json(new ApiResponse(200, {}, "Phone number verified successfully"));
});
// Verify phone number
const verifyPhoneNumber = asyncHandler(async (req, res) => {
  const {code} = req.body;

  if (!code) {
    throw new ApiError(400, "Verification code is required");
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.isPhoneVerified) {
    throw new ApiError(400, "Phone number is already verified");
  }

  // Check if code matches
  if (user.phoneVerificationToken !== code) {
    user.phoneVerificationAttempts += 1;
    await user.save({validateBeforeSave: false});

    if (user.phoneVerificationAttempts >= 3) {
      throw new ApiError(400, "Too many attempts. Please request a new code.");
    }

    throw new ApiError(400, "Invalid verification code");
  }

  // Check if code is expired
  if (user.phoneVerificationExpires < Date.now()) {
    throw new ApiError(400, "Verification code has expired");
  }

  // Mark phone as verified
  user.isPhoneVerified = true;
  user.phoneVerificationToken = undefined;
  user.phoneVerificationExpires = undefined;
  user.phoneVerificationAttempts = 0;
  await user.save({validateBeforeSave: false});

  res.status(200).json(new ApiResponse(200, {}, "Phone number verified successfully"));
});

// Login user

const loginUser = asyncHandler(async (req, res) => {
  const {email, password} = req.body;

  if (!email || !password) {
    logger.error("Email and password are required");
    throw new ApiError(400, "Email and password are required");
  }

  try {
    logger.info("Starting loginUser process");

    // Find user
    const user = await User.findOne({email});
    if (!user) {
      logger.error("User not found");
      throw new ApiError(401, "Invalid email or password"); // Generic message for security
    }

    // Check if email is verified -- experimental feature
    if (!user.isEmailVerified) {
      logger.error("Login attempt with unverified email");
      throw new ApiError(403, "Please verify your email before logging in");
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      logger.error("Invalid password");
      throw new ApiError(401, "Invalid email or password"); // Generic message for security
    }

    // Generate tokens
    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id);

    // Remove sensitive fields
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken -verificationToken");

    // Set cookies
    const options = {
      httpOnly: true,
      secure: true
    };

    logger.info("User logged in successfully");

    res.status(200).cookie("accessToken", accessToken, options).cookie("refreshToken", refreshToken, options).json(new ApiResponse(200, {
      user: loggedInUser,
      accessToken,
      refreshToken
    }, "User logged in successfully"));
  } catch (error) {
    logger.error(`Error in loginUser: ${error.message}`, {stack: error.stack});
    throw new ApiError(error.statusCode || 500, error.message || "Failed to log in user");
  }
});

// Logout user
const logoutUser = asyncHandler(async (req, res) => {
  try {
    logger.info("Starting logoutUser process");

    await User.findByIdAndUpdate(
      req.user
      ?._id, {
      $unset: {
        refreshToken: 1
      }
    }, {new: true});

    const options = {
      httpOnly: true,
      secure: true
    };

    logger.info("User logged out successfully");

    res.status(200).clearCookie("accessToken", options).clearCookie("refreshToken", options).json(new ApiResponse(200, {}, "User logged out successfully"));
  } catch (error) {
    logger.error(`Error in logoutUser: ${error.message}`, {stack: error.stack});
    throw new ApiError(500, error.message || "Failed to log out user");
  }
});

// Refresh access token
const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies
    ?.refreshToken || req.body
      ?.refreshToken;

  if (!incomingRefreshToken) {
    logger.error("Unauthorized request");
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    logger.info("Starting refreshAccessToken process");

    // Verify refresh token
    const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decodedToken._id);

    if (!user) {
      logger.error("Invalid refresh token");
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user.refreshToken) {
      logger.error("Refresh token is expired or used");
      throw new ApiError(401, "Refresh token is expired or used");
    }

    // Generate new tokens
    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id);

    // Set cookies
    const options = {
      httpOnly: true,
      secure: true
    };

    logger.info("Access token refreshed successfully");

    res.status(200).cookie("accessToken", accessToken, options).cookie("refreshToken", refreshToken, options).json(new ApiResponse(200, {
      accessToken,
      refreshToken
    }, "Access token refreshed successfully"));
  } catch (error) {
    logger.error(`Error in refreshAccessToken: ${error.message}`, {stack: error.stack});
    throw new ApiError(500, error.message || "Failed to refresh access token");
  }
});

// Change password
const changePassword = asyncHandler(async (req, res) => {
  const {oldPassword, newPassword} = req.body;

  try {
    logger.info("Starting changePassword process");

    // Validate input fields
    if (!oldPassword || !newPassword) {
      logger.error("Old and new passwords are required");
      throw new ApiError(400, "Old and new passwords are required");
    }

    // Find the user
    const user = await User.findById(
      req.user
      ?._id);
    if (!user) {
      logger.error("User not found");
      throw new ApiError(404, "User not found");
    }

    // Check if the old password is correct
    const isPasswordValid = await user.comparePassword(oldPassword);
    if (!isPasswordValid) {
      logger.error("Invalid old password");
      throw new ApiError(401, "Invalid old password");
    }

    // Check if the new password is the same as the old password
    if (oldPassword === newPassword) {
      logger.error("New password must be different from the old password");
      throw new ApiError(400, "New password must be different from the old password");
    }

    // Validate new password strength
    if (!isPasswordStrong(newPassword)) {
      logger.error("New password is too weak");
      throw new ApiError(400, "New password is too weak. It must contain at least one uppercase letter, one lowercase letter, one digit, and one special character.");
    }

    // Update the password
    user.password = newPassword;
    await user.save({validateBeforeSave: false});

    logger.info("Password changed successfully");

    res.status(200).json(new ApiResponse(200, {}, "Password changed successfully"));
  } catch (error) {
    logger.error(`Error in changePassword: ${error.message}`, {stack: error.stack});
    throw new ApiError(500, error.message || "Failed to change password");
  }
});

// Get current user
const getCurrentUser = asyncHandler(async (req, res) => {
  try {
    logger.info("Starting getCurrentUser process");

    const user = req.user;
    if (!user) {
      logger.error("User not found");
      throw new ApiError(404, "User not found");
    }

    logger.info("Current user fetched successfully");

    res.status(200).json(new ApiResponse(200, user, "Current user fetched successfully"));
  } catch (error) {
    logger.error(`Error in getCurrentUser: ${error.message}`, {stack: error.stack});
    throw new ApiError(500, error.message || "Failed to fetch current user");
  }
});

// Update user details
const updateCurrentUserDetail = asyncHandler(async (req, res) => {
  const {fullName, email, phone} = req.body;

  // Check if at least one field is provided
  if (!fullName && !email && !phone) {
    throw new ApiError(400, "At least one field (fullName or email) is required");
  }

  // Check if the new email already exists in the database
  if (email) {
    const existingUser = await User.findOne({email});
    if (existingUser && existingUser._id.toString() !== req.user._id.toString()) {
      throw new ApiError(409, "Email is already in use");
    }
  }
  if (phone) {
    const existingPhoneNo = await User.findOne({phone});
    if (existingPhoneNo && existingPhoneNo._id.toString() !== req.user._id.toString()) {
      throw new ApiError(409, "Phone no  is already in use");
    }
  }

  // Update the user details
  const user = await User.findByIdAndUpdate(req.user._id, {
    $set: {
      fullName,
      email,
      phone
    }
  }, {new: true}).select("-password -refreshToken -verificationToken");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  res.status(200).json(new ApiResponse(200, user, "User details updated successfully"));
});

//update users address
const updateUserAddress = asyncHandler(async (req, res) => {
  const {country, city, street} = req.body;

  try {
    logger.info("Starting updateUserAddress process");

    // Check if at least one address field is provided
    if (!country && !city && !street) {
      logger.error("At least one address field (country, city, or street) is required");
      throw new ApiError(400, "At least one address field is required");
    }

    // Prepare update object with only provided fields
    const updateFields = {};
    if (country) 
      updateFields["address.country"] = country;
    if (city) 
      updateFields["address.city"] = city;
    if (street) 
      updateFields["address.street"] = street;
    
    // Update the user address
    const updatedUser = await User.findByIdAndUpdate(req.user._id, {
      $set: updateFields
    }, {new: true}).select("-password -refreshToken -verificationToken");

    if (!updatedUser) {
      logger.error("User not found");
      throw new ApiError(404, "User not found");
    }

    logger.info("User address updated successfully");
    res.status(200).json(new ApiResponse(200, updatedUser, "Address updated successfully"));
  } catch (error) {
    logger.error(`Error in updateUserAddress: ${error.message}`, {stack: error.stack});
    throw new ApiError(500, error.message || "Failed to update address");
  }
});

// Request password reset
const requestPasswordReset = asyncHandler(async (req, res) => {
  const {email} = req.body;

  try {
    logger.info("Starting requestPasswordReset process");

    // Validate input
    if (!email) {
      logger.error("Email is required");
      throw new ApiError(400, "Email is required");
    }

    // Find user by email
    const user = await User.findOne({email});
    if (!user) {
      logger.error("User not found");
      throw new ApiError(404, "User not found");
    }

    // Generate reset token
    const resetToken = user.generateAccessToken();
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save({validateBeforeSave: false});

    // Send password reset email
    await sendPasswordResetEmail(email, resetToken);

    logger.info("Password reset email sent");

    res.status(200).json(new ApiResponse(200, {}, "Password reset email sent. Please check your email."));
  } catch (error) {
    logger.error(`Error in requestPasswordReset: ${error.message}`, {stack: error.stack});
    throw new ApiError(500, error.message || "Failed to process password reset request");
  }
});

// Reset password
const resetPassword = asyncHandler(async (req, res) => {
  const {token, newPassword} = req.body;

  try {
    logger.info("Starting resetPassword process");

    // Validate input
    if (!token || !newPassword) {
      logger.error("Token and new password are required");
      throw new ApiError(400, "Token and new password are required");
    }

    // Verify token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(decodedToken._id);

    if (!user) {
      logger.error("User not found");
      throw new ApiError(404, "User not found");
    }

    // Check if token is valid and not expired
    if (user.resetPasswordToken !== token || user.resetPasswordExpires < Date.now()) {
      logger.error("Invalid or expired token");
      throw new ApiError(400, "Invalid or expired token");
    }

    // Check if new password is the same as the old password
    const isPasswordMatch = await user.comparePassword(newPassword);
    if (isPasswordMatch) {
      logger.error("New password cannot be the same as the old password");
      throw new ApiError(400, "New password cannot be the same as the old password");
    }

    // Update password
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save({validateBeforeSave: false});

    logger.info("Password reset successfully");

    res.status(200).json(new ApiResponse(200, {}, "Password reset successfully"));
  } catch (error) {
    logger.error(`Error in resetPassword: ${error.message}`, {stack: error.stack});

    if (error.name === "JsonWebTokenError") {
      throw new ApiError(400, "Invalid or expired token");
    }
    throw new ApiError(500, error.message || "Failed to reset password");
  }
});

// Upload profile image
const uploadProfileImage = asyncHandler(async (req, res) => {
  try {
    logger.info("Starting uploadProfileImage process");

    const userId = req.user._id;
    const file = req.file;

    // Check if image was uploaded
    if (!file) {
      logger.error("No image file provided");
      throw new ApiError(400, "Please provide a profile image");
    }

    // Upload to Cloudinary
    const cloudinaryResponse = await uploadOnCloudinary(file.path);
    if (
      !cloudinaryResponse
      ?.secure_url) {
      logger.error("Failed to upload image to Cloudinary");
      throw new ApiError(500, "Failed to upload profile image");
    }

    // Update user profile image
    const user = await User.findByIdAndUpdate(userId, {
      profileImage: cloudinaryResponse.secure_url
    }, {new: true}).select("-password -refreshToken -verificationToken");

    if (!user) {
      logger.error("User not found");
      throw new ApiError(404, "User not found");
    }

    logger.info("Profile image uploaded successfully");
    res.status(200).json(new ApiResponse(200, user, "Profile image uploaded successfully"));
  } catch (error) {
    logger.error(`Error in uploadProfileImage: ${error.message}`, {stack: error.stack});
    throw new ApiError(500, error.message || "Failed to upload profile image");
  }
});

// Update profile image
const updateProfileImage = asyncHandler(async (req, res) => {
  try {
    logger.info("Starting updateProfileImage process");

    const userId = req.user._id;
    const file = req.file;

    // Check if image was uploaded
    if (!file) {
      logger.error("No image file provided");
      throw new ApiError(400, "Please provide a profile image");
    }

    // Get current user to check existing image
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      logger.error("User not found");
      throw new ApiError(404, "User not found");
    }

    // Delete old image from Cloudinary if exists
    if (currentUser.profileImage) {
      try {
        // Extract public_id from URL (Cloudinary specific)
        const publicId = currentUser.profileImage.split("/").pop().split(".")[0];
        await deleteFromCloudinary(publicId);
        logger.info("Old profile image deleted from Cloudinary");
      } catch (error) {
        logger.error("Failed to delete old profile image", error);
        // Continue with upload even if deletion fails
      }
    }

    // Upload new image to Cloudinary
    const cloudinaryResponse = await uploadOnCloudinary(file.path);
    if (
      !cloudinaryResponse
      ?.secure_url) {
      logger.error("Failed to upload image to Cloudinary");
      throw new ApiError(500, "Failed to upload profile image");
    }

    // Update user profile image
    const updatedUser = await User.findByIdAndUpdate(userId, {
      profileImage: cloudinaryResponse.secure_url
    }, {new: true}).select("-password -refreshToken -verificationToken");

    if (!updatedUser) {
      logger.error("User not found");
      throw new ApiError(404, "User not found");
    }

    logger.info("Profile image updated successfully");
    res.status(200).json(new ApiResponse(200, updatedUser, "Profile image updated successfully"));
  } catch (error) {
    logger.error(`Error in updateProfileImage: ${error.message}`, {stack: error.stack});
    throw new ApiError(500, error.message || "Failed to update profile image");
  }
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changePassword,
  getCurrentUser,
  updateCurrentUserDetail,
  updateUserAddress,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  uploadProfileImage,
  updateProfileImage,
  resendVerificationEmail,
  sendPhoneVerification,
  sendWhatsAppVerifications,
  verifyWhatsAppCode,
  verifyPhoneNumber
};