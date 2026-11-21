import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database seed...");

  // Create a demo user
  const user = await prisma.user.upsert({
    where: { email: "demo@vaulty.app" },
    update: {},
    create: {
      email: "demo@vaulty.app",
      name: "Demo User",
      image: null,
    },
  });

  console.log(`Created user: ${user.id}`);

  // Root folder
  const rootFolder = await prisma.folder.create({
    data: {
      name: "My Documents",
      ownerId: user.id,
    },
  });

  console.log(`Created folder: ${rootFolder.id}`);

  // Sample document
  await prisma.document.create({
    data: {
      name: "Welcome to Vaulty.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      folderId: rootFolder.id,
      ownerId: user.id,
    },
  });

  // Sample wealth account
  await prisma.wealthAccount.create({
    data: {
      ownerId: user.id,
      name: "Primary Savings",
      type: "SAVINGS_ACCOUNT",
      status: "ACTIVE",
      accountNumber: "****1234",
      bankName: "Demo Bank",
      currentBalance: "50000.00",
      currency: "INR",
      category: "Banking",
      tags: ["personal", "savings"],
      notes: "Primary savings account for daily expenses.",
    },
  });

  // Sample notification
  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "INFO",
      title: "Welcome to Vaulty",
      message:
        "Your private vault is ready. Start by adding documents, wealth accounts, and credentials.",
      read: false,
    },
  });

  console.log("Database seed completed.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
