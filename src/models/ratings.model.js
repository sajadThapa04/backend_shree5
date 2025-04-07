import mongoose, {Schema} from "mongoose";

const ratingSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  host: {
    type: Schema.Types.ObjectId,
    ref: "Host",
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {timestamps: true});

const Rating = mongoose.model("Rating", ratingSchema);

export {
  Rating
};
