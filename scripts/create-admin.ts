import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function createSuperAdmin() {
  console.log("Creating super admin user...");

  // Check if organization exists, if not create one
  let org = await prisma.organization.findFirst({
    where: { slug: "netwatch-admin" }
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "NetWatch Admin",
        slug: "netwatch-admin",
        plan: "enterprise",
      },
    });
    console.log("Created organization:", org.name);
  } else {
    console.log("Using existing organization:", org.name);
  }

  // Check if admin user exists
  const existingUser = await prisma.user.findUnique({
    where: { email: "admin@netwatch.io" }
  });

  if (existingUser) {
    console.log("Admin user already exists!");
    console.log("\nCredentials:");
    console.log("Email: admin@netwatch.io");
    console.log("Password: (unchanged from previous)");
    return;
  }

  // Create super admin user
  const hashedPassword = await bcrypt.hash("NetWatch@2025!", 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@netwatch.io",
      password: hashedPassword,
      name: "Super Admin",
      role: "ADMIN",
      organizationId: org.id,
    },
  });

  console.log("\n✅ Super Admin created successfully!");
  console.log("\n========================================");
  console.log("LOGIN CREDENTIALS");
  console.log("========================================");
  console.log("Email:    admin@netwatch.io");
  console.log("Password: NetWatch@2025!");
  console.log("========================================");
  console.log("\n⚠️  Please change this password after first login!");
}

createSuperAdmin()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
