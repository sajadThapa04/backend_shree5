const env = {
  DB_CONNECTION: process.env.DB_CONNECTION || "mongodb+srv://sajad:sajad0123@cluster0.id69p.mongodb.net",
  PORT: process.env.PORT || 8000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",

  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET || "eyJhbGciOiJIUzI1NiJ9.eyJSb2xlIjoiQWRtaW4iLCJJc3N1ZXIiOiJJc3N1ZXIiLCJVc2VybmFtZSI6IkphdmFJblVzZSIsImV4cCI6MTczOTA5NjgwMCwiaWF0IjoxNzM5MDk2ODAwfQ.XlRPc7MHAVF1j5UzeRp7WaSOuFimv32gPYiRNChMRPU",
  ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN || "1d",

  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || "eyJhbGciOiJIUzI1NiJ9.eyJSb2xlIjoiQWRtaW4iLCJJc3N1ZXIiOiJJc3N1ZXIiLCJVc2VybmFtZSI6IkphdmFJblVzZSIsImV4cCI6MTczOTA5NjgwMCwiaWF0IjoxNzM5MDk2ODAwfQ.__zDH3T6Bev4PKgXPPVzulmIdUhB1EYdTkgOmjNYX2o",
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",

  // Mailtrap Configuration
  SMTP_HOST: process.env.SMTP_HOST || "sandbox.smtp.mailtrap.io",
  SMTP_PORT: process.env.SMTP_PORT || 2525,
  SMTP_USER: process.env.SMTP_USER || "04653ee1c8603e",
  SMTP_PASS: process.env.SMTP_PASS || "f206df302dcbeb",

  // Frontend URL for email links
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",

  // Mapbox API Key
  MAPBOX_API_KEY: process.env.MAPBOX_API_KEY || "pk.eyJ1IjoidXJiYW4tdm91Z2UwMjMiLCJhIjoiY204OXBwY280MHo2MDJrcXU3aHhxamxlbCJ9.LSo87CGseTJQ756wzc5u4Q",

  // Cloudinary Configuration
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "dk9ypk7jo",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "511111194753783",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "IRXCQA_qfCSziYQRDP3toXI15rQ",

  // Payment Configuration - Stripe
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "sk_test_51R3YUVCfveuBblubHtX954uMkX7cHsCyOqxWDb5O188HISw1ykC3lEKI4GGCUiu2FahAaJV8EVlVfcPyow7xig1800UEkpD0E5",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "whsec_0655ecac6c32be77c5adec3c037d94f1c2a9b99e16978b2d69e6b7dfea6c9a11"
};

export default env;
