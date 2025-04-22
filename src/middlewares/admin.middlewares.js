import {ApiError} from "../utils/ApiError.js";
import {asyncHandler} from "../utils/asyncHandler.js";

const isAdmin = asyncHandler(async (req, res, next) => {
  try {
    // Assuming your verifyJWT middleware already attached the user to req.user
    if (!req.user) {
      throw new ApiError(401, "Unauthorized - Please authenticate");
    }

    // Check if user has admin privileges
    if (req.user.role !== "admin") {
      throw new ApiError(403, "Forbidden - Admin access required");
    }

    next();
  } catch (error) {
    throw new ApiError(error.statusCode || 500, error.message || "Admin verification failed");
  }
});

export {
  isAdmin
};
