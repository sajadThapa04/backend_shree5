import {createRestaurantBooking, updateRestaurantBooking, getRestaurantBookings, getUserRestaurantBookings, cancelRestaurantBooking} from "../controllers/restaurantsBooking.controller.js";
import Router from "express";
import {verifyJwt} from "../middlewares/auth.middlewares.js";

const router = Router();

router.route("/").post(verifyJwt, createRestaurantBooking);
router.route("/:id").patch(verifyJwt, updateRestaurantBooking);
router.route("/:id").delete(verifyJwt, cancelRestaurantBooking);

router.route("/user").get(verifyJwt, getUserRestaurantBookings);
router.route("/service/:restaurantId").get(verifyJwt, getRestaurantBookings);

export default router;