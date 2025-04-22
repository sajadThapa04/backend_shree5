import express from "express";
import cors from "cors";
import cookie_parser from "cookie-parser";
import errorHandler from "./middlewares/error.middleware.js";
//web hook importing
import webHookRouter from "./routes/webhook.routes.js";

const app = express();

//webhook router
app.use("/api/v1/webhook", webHookRouter); //webhook router

//will use this in future for production of this app
// app.use(cors({
//     origin: ['http://localhost:3000', 'your-production-url'],
//     credentials: true,
//     methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
//     allowedHeaders: ['Content-Type', 'Authorization']
// }));

app.use(cors({origin: process.env.CORS_ORIGIN, credentials: true}));

app.use(cookie_parser());
app.use(express.json({limit: "104kb"}));
app.use(express.static("public"));
app.use(express.urlencoded({extended: true, limit: "104kb"}));

// testing router
import testRouter from "./routes/test/test.routes.js";

//initialising test router
app.use("/api", testRouter);

//importing router
import userRouter from "./routes/user.routes.js";
import hostRouter from "./routes/host.routes.js";
import ratingRouter from "./routes/rating.routes.js";
import reviewRouter from "./routes/review.routes.js";
import bookingRouter from "./routes/booking.routes.js";
import serviceRouter from "./routes/services.routes.js";
import roomRouter from "./routes/room.routes.js";
import restaurantRouter from "./routes/restaurant.routes.js";
import paymentRouter from "./routes/payment.routes.js";
import adminRouter from "./routes/admin.routes.js";

//initialising router
app.use("/api/v1/users", userRouter); //user router
app.use("/api/v1/hosts", hostRouter); //host router
app.use("/api/v1/ratings", ratingRouter); // rating router
app.use("/api/v1/reviews", reviewRouter); // review router
app.use("/api/v1/bookings", bookingRouter); // booking router
app.use("/api/v1/services", serviceRouter); //service router
app.use("/api/v1/rooms", roomRouter); //room routers
app.use("/api/v1/restaurants", restaurantRouter); // restaurant router
app.use("/api/v1/payments", paymentRouter); //payment router
app.use("/api/v1/admin", adminRouter); // admin router

app.use(errorHandler);

export default app;

// import dotenv from "dotenv";
// import bodyParser from "body-parser";
// import {handleStripeWebhook} from "./utils/payment_gateways/stripe.js";
// dotenv.config({path: "./.env"});

// app.use(bodyParser.raw({type: "application/json"}));
//  Stripe webhook endpoint
// app.post("/webhook", async (req, res) => {
//   const sig = req.headers["stripe-signature"];
//   const payload = req.body;

//   try {
//      Verify the webhook signature
//     const event = await handleStripeWebhook(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);

//      Handle the event
//     switch (event.type) {
//       case "payment_intent.succeeded":
//         const paymentIntent = event.data.object;
//         console.log("PaymentIntent was successful:", paymentIntent.id);

//          Update the payment status in your database
//         await Payment.findOneAndUpdate({
//           transactionId: paymentIntent.id
//         }, {
//           paymentStatus: "succeeded"
//         }, {new: true});
//         break;

//       case "payment_intent.payment_failed":
//         const failedPaymentIntent = event.data.object;
//         console.log("PaymentIntent failed:", failedPaymentIntent.id);

//          Update the payment status in your database
//         await Payment.findOneAndUpdate({
//           transactionId: failedPaymentIntent.id
//         }, {
//           paymentStatus: "failed"
//         }, {new: true});
//         break;

//       default:
//         console.log(`Unhandled event type: ${event.type}`);
//     }

//      Return a response to acknowledge receipt of the event
//     res.json({received: true});
//   } catch (error) {
//     console.error("Webhook Error:", error.message);
//     res.status(400).send(`Webhook Error: ${error.message}`);
//   }
// });
