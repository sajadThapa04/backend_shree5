import express from "express";
import {
  createSuperadmin,
  createAdmin,
  loginAdmin,
  logoutAdmin,
  refreshAdminToken,
  updateHostStatus,
  getAllHostsByStatus,
  deleteAdmin
} from "../controllers/admin.controller.js";
import {verifyAdminJwt, verifyAdminRefreshToken} from "../middlewares/admin.auth.middlewares.js";

const router = express.Router();

// Public routes
router.route("/init-superadmin").post(createSuperadmin); // Should be protected in production
router.route("/login").post(loginAdmin);
router.route("/refresh-token").post(verifyAdminRefreshToken, refreshAdminToken);

// Protected routes (require valid admin access token)
router.use(verifyAdminJwt);

router.route("/create-admin").post(createAdmin);
router.route("/:adminId").delete(deleteAdmin); // DELETE /api/v1/admin/:adminId
router.route("/logout").post(logoutAdmin);
router.route("/:hostId/status").patch(updateHostStatus);
router.route("/").get(getAllHostsByStatus);

export default router;