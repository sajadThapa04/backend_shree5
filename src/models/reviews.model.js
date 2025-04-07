import mongoose, { Schema } from "mongoose";

const reviewSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    host: {
      type: Schema.Types.ObjectId,
      ref: "Host",
      required: true,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 500, // Limit the length of the comment
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const Review = mongoose.model("Review", reviewSchema);

export { Review };