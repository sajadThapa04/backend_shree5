export const verifyGuestPayment = (req, res, next) => {
  const {guestInfo, booking} = req.body;

  if (
    !guestInfo
    ?.email) {
    return res.status(400).json({success: false, message: "Guest payments require email"});
  }

  if (!booking) {
    return res.status(400).json({success: false, message: "Booking reference is required"});
  }

  // Add guest info to request
  req.guestInfo = {
    email: guestInfo.email.trim().toLowerCase()
  };

  next();
};