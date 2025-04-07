import crypto from "crypto";

const payload = JSON.stringify({
  id: "evt_1R3r9SCfveuBblub1kxMMrlp",
  object: "event",
  api_version: "2023-08-16",
  created: 1742269754,
  data: {
    object: {
      id: "pi_3R3r9SCfveuBblub1kxMMrlp",
      object: "payment_intent",
      amount: 100000,
      amount_received: 100000,
      currency: "usd",
      status: "succeeded",
      metadata: {
        bookingId: "67d7b85a5ecd2dd31d9f15e2",
        userId: "67d564c0fa1138b41d145328"
      }
    }
  },
  livemode: false,
  pending_webhooks: 1,
  request: {
    id: "req_1R3r9SCfveuBblub1kxMMrlp",
    idempotency_key: null
  },
  type: "payment_intent.succeeded"
});

const secret = "whsec_0655ecac6c32be77c5adec3c037d94f1c2a9b99e16978b2d69e6b7dfea6c9a11"; // Replace with your webhook secret
const timestamp = Math.floor(Date.now() / 1000); // Current timestamp
const signedPayload = `${timestamp}.${payload}`;
const signature = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");

console.log("Stripe-Signature:", `t=${timestamp},v1=${signature}`);


// signature-header t=1742276112,v1=09cb497ffc4a4fe52526d99a190285b4eafdaa7eb95108816fbb0b8777b8f289