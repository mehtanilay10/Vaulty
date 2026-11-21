import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);

  const result = await prisma.aiProcessing.updateMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lt: cutoff },
    },
    data: {
      status: "QUEUED",
      errorMessage: null,
    },
  });

  console.log(`Reset ${result.count} stale PROCESSING records to QUEUED`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect().then(() => process.exit(0)));
