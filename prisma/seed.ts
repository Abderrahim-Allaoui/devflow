import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@devflow.app";
  const passwordHash = await hashPassword("devflow123");

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Demo User", passwordHash },
  });

  const existing = await prisma.board.findFirst({ where: { ownerId: user.id } });
  if (existing) {
    console.log("Seed already applied — nothing to do.");
    return;
  }

  await prisma.board.create({
    data: {
      title: "Sprint 1 — MVP",
      ownerId: user.id,
      columns: {
        create: [
          {
            title: "Backlog",
            position: 0,
            tasks: {
              create: [
                { title: "Define MVP scope", description: "Kanban + auth + API", priority: "high", position: 0 },
                { title: "Design DB schema", priority: "medium", position: 1 },
              ],
            },
          },
          {
            title: "In progress",
            position: 1,
            tasks: {
              create: [{ title: "JWT auth flow", description: "httpOnly cookies + bcrypt", priority: "high", position: 0 }],
            },
          },
          {
            title: "Done",
            position: 2,
            tasks: {
              create: [{ title: "Project scaffolding", priority: "low", position: 0 }],
            },
          },
        ],
      },
    },
  });

  console.log(`Seeded demo account → ${email} / devflow123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
