import { db_connection } from "./db/index.js";
import dotenv from "dotenv";
import app from "./app.js";
// import geocodeCoordinates from "./utils/geoCordinates.js";

// import {createStripePaymentIntent} from "./utils/payment_gateways/stripe.js";

dotenv.config({ path: "./.env" });

db_connection().then(() => {
  const port = process.env.PORT || 8000;
  app.on("err", err => {
    console.log(err);
  });

  app.listen(port, () => {
    console.log("server is listening on port:", port);
  });
}).catch(err => {
  console.log("something went wrong: \n", err);
});


// const createTestPayment = async () => {
//   try {
//     const amount = 1000;  Amount in dollars (e.g., $10.00)
//     const currency = "usd";
//     const paymentIntent = await createStripePaymentIntent(amount, currency, {
//       metadata: {
//         bookingId: "67d7b85a5ecd2dd31d9f15e2",  Example booking ID
//         userId: "67d564c0fa1138b41d145328"  Example user ID
//       }
//     });

//     console.log("Payment Intent Created:", paymentIntent);
//     return paymentIntent;
//   } catch (error) {
//     console.error("Error creating payment intent:", error.message);
//   }
// };

// createTestPayment();

// import Stripe from "stripe";
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// const confirmTestPayment = async paymentIntentId => {
//   try {
//      Create a test payment method
//     const paymentMethod = await stripe.paymentMethods.create({
//       type: "card",
//       card: {
//         number: "4242424242424242",  Test card number
//         exp_month: 12,
//         exp_year: 2025,
//         cvc: "123"
//       }
//     });

//      Confirm the payment intent
//     const confirmedPaymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {payment_method: paymentMethod.id});

//     console.log("Payment Confirmed:", confirmedPaymentIntent);
//     return confirmedPaymentIntent;
//   } catch (error) {
//     console.error("Error confirming payment intent:", error.message);
//   }
// };

//  Call the function with the payment intent ID from Step 2
// let payment = confirmTestPayment("pi_3R3r3VCfveuBblub0nuPojER");  Replace with the actual payment intent ID
// console.log("payment",payment)
//  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
// console.log(stripe);
// for testing purpose below are the code
// ;  Example for New York City

// const coordinates = [-74.006, 40.7128];

// (async () => {
//   try {
//     const address = await geocodeCoordinates(coordinates);
//     console.log("Geocoded Address:", address);
//   } catch (error) {
//     console.error("Error:", error.message);
//   }
// })();

// used the below console.log for testing purpose
// console.log("SMTP_HOST:", process.env.SMTP_HOST);
// console.log("SMTP_PORT:", process.env.SMTP_PORT);
// console.log("SMTP_USER:", process.env.SMTP_USER);
// console.log("SMTP_PASS:", process.env.SMTP_PASS);