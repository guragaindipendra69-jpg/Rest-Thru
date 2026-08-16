import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PLAN_LIMITS, type PlanType } from "../lib/plan-limits";

const prisma = new PrismaClient();

// lib/plan-limits.ts is the single source of truth for caps, and its header
// states the DB "is seeded from these same values". That was not true: this
// file carried its own literals, and the three copies drifted -- FREE was
// enforced at 10 staff by plan-guard while the seed wrote 3 and the live row
// held 5, so the pricing page advertised a different cap than the one the
// server applied. Deriving them here makes that comment true by construction.
//
// The cap columns are Int, so Infinity cannot be stored. UNLIMITED collapses
// to the sentinels the schema already used (9999 for tables/menu items, 999
// for staff/locations), and formatCap() on the pricing page renders anything
// at or above 9999 as "Unlimited".
function capsFor(type: PlanType) {
  const limits = PLAN_LIMITS[type];
  const finite = (value: number, sentinel: number) =>
    Number.isFinite(value) ? value : sentinel;
  return {
    maxTables: finite(limits.maxTables, 9999),
    maxStaff: finite(limits.maxStaff, 999),
    maxMenuItems: finite(limits.maxMenuItems, 9999),
    maxRestaurants: finite(limits.maxRestaurants, 999),
  };
}

async function main() {
  const adminPassword = await bcrypt.hash("admin@123", 12);
  const superAdminPassword = await bcrypt.hash("password@123", 12);
  const restaurantPassword = await bcrypt.hash("java@123", 12);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      email: "admin@resthru.com",
      passwordHash: adminPassword,
      firstName: "Super",
      lastName: "Admin",
      role: "ADMIN",
      isActive: true,
    },
  });
  console.log("Admin user created:", admin.username);

  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@drillthru.tech" },
    update: {},
    create: {
      username: "drillthru admin",
      email: "admin@drillthru.tech",
      passwordHash: superAdminPassword,
      firstName: "Super",
      lastName: "Admin",
      role: "ADMIN",
      isActive: true,
    },
  });
  console.log("Super admin user created:", superAdmin.email);

  // Seed default plans
  const defaultPlans = [
    {
      id: "plan-free",
      type: "FREE",
      name: "Free",
      description: "For the single-room place still finding its feet.",
      monthlyPrice: 0,
      annualPrice: 0,
      currency: "NPR",
      ...capsFor("FREE"),
      features: [
        "Up to 5 tables",
        "Basic QR ordering",
        "Manual billing",
        "Email support",
      ],
      displayOrder: 0,
      isPopular: false,
      colorHex: "#6b7280",
      isActive: true,
    },
    {
      id: "plan-basic",
      type: "BASIC",
      name: "Growth",
      description: "For when one QR code is no longer enough.",
      monthlyPrice: 999,
      annualPrice: 9990,
      currency: "NPR",
      ...capsFor("BASIC"),
      features: [
        "Up to 20 tables",
        "Full QR ordering",
        "Automated billing",
        "Inventory tracking",
        "Priority support",
      ],
      displayOrder: 1,
      isPopular: true,
      colorHex: "#4f46e5",
      isActive: true,
    },
    {
      id: "plan-pro",
      type: "PRO",
      name: "Enterprise",
      description: "For chains juggling more than one kitchen.",
      monthlyPrice: 2999,
      annualPrice: 29990,
      currency: "NPR",
      ...capsFor("PRO"),
      features: [
        "Unlimited tables",
        "All Growth features",
        "Advanced analytics",
        "Multi-location (up to 3)",
        "API access",
        "Dedicated support",
      ],
      displayOrder: 2,
      isPopular: false,
      colorHex: "#059669",
      isActive: true,
    },
    {
      id: "plan-enterprise",
      type: "ENTERPRISE",
      name: "Enterprise Plus",
      description: "Custom solutions for large-scale operations.",
      monthlyPrice: 9999,
      annualPrice: 99990,
      currency: "NPR",
      ...capsFor("ENTERPRISE"),
      features: [
        "Unlimited tables",
        "All Pro features",
        "Custom integrations",
        "Unlimited branches",
        "White-label options",
        "24/7 dedicated support",
      ],
      displayOrder: 3,
      isPopular: false,
      colorHex: "#d97706",
      isActive: true,
    },
  ];

  for (const plan of defaultPlans) {
    await prisma.plan.upsert({
      where: { type: plan.type },
      update: plan,
      create: plan,
    });
    console.log(`Plan seeded: ${plan.name} (${plan.type})`);
  }

  const restaurant = await prisma.restaurant.upsert({
    where: { id: "demo-restaurant" },
    update: {},
    create: {
      id: "demo-restaurant",
      name: "Himalayan Java",
      type: "CASUAL_DINING",
      email: "info@himalayanjava.com",
      phoneNumber: "+977-1-4XXXXXX",
      street: "Durbar Marg",
      city: "Kathmandu",
      state: "Bagmati",
      country: "Nepal",
      timezone: "Asia/Kathmandu",
      currency: "NPR",
      totalTables: 10,
      totalStaff: 5,
      isActive: true,
    },
  });
  console.log("Restaurant created:", restaurant.name);

  const owner = await prisma.user.upsert({
    where: { username: "himalayan java" },
    update: {},
    create: {
      username: "himalayan java",
      email: "owner@himalayanjava.com",
      passwordHash: restaurantPassword,
      firstName: "Himalayan",
      lastName: "Java Owner",
      // Must be RESTAURANT_OWNER, not "OWNER". `User.role` is a free-text
      // String, so a wrong value is accepted silently and only fails later:
      // portalForRole() falls through to the owner portal for anything it
      // doesn't recognise, so this account could log in and reach the
      // dashboard, but OWNER_ROLES in lib/auth-tenant.ts is
      // ["RESTAURANT_OWNER", "STAFF"] - so every tenant-scoped action then
      // rejected it. The seeded demo owner was a login that appeared to work
      // and could do nothing.
      role: "RESTAURANT_OWNER",
      restaurantId: restaurant.id,
      isActive: true,
    },
  });
  console.log("Restaurant owner created:", owner.username);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
