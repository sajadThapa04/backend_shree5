import Router from "express";
import {
  changePassword,
  getCurrentUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
  verifyEmail,
  resendVerificationEmail,
  requestPasswordReset,
  resetPassword,
  updateCurrentUserDetail,
  updateUserAddress,
  uploadProfileImage,
  updateProfileImage,
  sendPhoneVerification,
  sendWhatsAppVerifications,
  verifyWhatsAppCode,
  verifyPhoneNumber
} from "../controllers/user.controller.js";
import {upload} from "../middlewares/multer.middlewares.js";
import {verifyJwt} from "../middlewares/auth.middlewares.js";
import {authRateLimiter, strictAuthRateLimiter} from "../middlewares/ratelimit.middlewares.js";

const router = Router();

// Public routes
router.route("/register").post(authRateLimiter, registerUser); // Register a new user
router.route("/login").post(authRateLimiter, loginUser); // Login user
router.route("/verify-email").get(authRateLimiter, verifyEmail); // Verify email (GET /verify-email?token=...)
router.route("/resend-verification").post(strictAuthRateLimiter, resendVerificationEmail);
router.route("/request-password-reset").post(strictAuthRateLimiter, requestPasswordReset); // Request password reset
router.route("/reset-password").post(strictAuthRateLimiter, resetPassword); // Reset password

// Protected routes (require JWT authentication)
router.route("/logout").post(verifyJwt, logoutUser); // Logout user
router.route("/refresh-token").post(authRateLimiter, refreshAccessToken); // Refresh access token

// Phone verification
router.route("/send-phone-verification").post(verifyJwt, strictAuthRateLimiter, sendPhoneVerification);
router.route("/verify-phone").post(verifyJwt, strictAuthRateLimiter, verifyPhoneNumber);

// WhatsApp verification
router.route("/send-whatsapp-verification").post(verifyJwt, strictAuthRateLimiter, sendWhatsAppVerifications);
router.route("/verify-whatsapp-code").post(verifyJwt, strictAuthRateLimiter, verifyWhatsAppCode);

// Other protected routes
router.route("/change-password").post(verifyJwt, changePassword); // Change password
router.route("/get-user").get(verifyJwt, getCurrentUser); // Get current user
router.route("/update-user-detail").patch(verifyJwt, updateCurrentUserDetail); // Update user details
router.route("/update-user-address").patch(verifyJwt, updateUserAddress); // Update user address
router.route("/upload-profile-image").patch(verifyJwt, upload.single("profileImage"), uploadProfileImage);
router.route("/update-profile-image").patch(verifyJwt, upload.single("profileImage"), updateProfileImage);

export default router;