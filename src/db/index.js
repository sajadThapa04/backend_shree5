import mongoose from "mongoose";
import db_name from "../constants.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";

const db_connection = async () => {
  try {
    const connection_host = await mongoose.connect(`${process.env.DB_CONNECTION}/${db_name}`);
    console.log(`mongoose is connected on ${connection_host.connection.host}`);
  } catch (error) {
    throw new ApiError("502", "not able to connect to database");
    console.log(error);
  }
};
export {
  db_connection
};
