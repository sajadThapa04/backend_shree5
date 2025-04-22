import {Admin} from "../models/admin.models.js";
import bcrypt from "bcrypt";

const createSuperadmin = async () => {
  const exists = await Admin.findOne({role: "superadmin"});
  if (exists) {
    console.log("Superadmin already exists");
    process.exit(0);
  }

  await Admin.create({
    fullName: "System Owner",
    email: "superadmin@system.com",
    password: await bcrypt.hash("Murgiya0123@", 12),
    role: "superadmin",
    permissions: {
      manageUsers: true,
      manageHosts: true,
      manageContent: true,
      manageSettings: true
    }
  });

  console.log("Superadmin created. CHANGE THE PASSWORD IMMEDIATELY.");
};

createSuperadmin();