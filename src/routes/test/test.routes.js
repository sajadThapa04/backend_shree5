import express from "express";
import geocodeCoordinates from "../../utils/geoCordinates.js";

const router = express.Router();

// Endpoint to geocode coordinates
router.post("/geocode", async (req, res) => {
  try {
    const {coordinates} = req.body;

    // Validate coordinates
    if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(coord => typeof coord === "number")) {
      return res.status(400).json({message: "Coordinates must be an array of [longitude, latitude]"});
    }

    // Call the geocodeCoordinates function
    const address = await geocodeCoordinates(coordinates);

    // Return the geocoded address
    res.status(200).json({address});
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({message: "Failed to geocode coordinates"});
  }
});

export default router;