export const verifyGuestBooking = (req, res, next) => {
  const {guestInfo} = req.body;

  // Validate required guest information
  if (!guestInfo || !guestInfo.fullName || !guestInfo.email) {
    return res.status(400).json({success: false, message: "Guest bookings require full name and email"});
  }

  // Simple email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(guestInfo.email)) {
    return res.status(400).json({success: false, message: "Please provide a valid email address"});
  }

  // Add guest info to request object
  req.guestInfo = {
    fullName: guestInfo.fullName.trim(),
    email: guestInfo.email.trim().toLowerCase(),
    phone: guestInfo.phone
      ?.trim() || null
  };

  next();
};