import { createPrismaClient } from "../src/infrastructure/prisma/prisma-client.js";
import { checkPostgreSQL } from "../src/infrastructure/postgresql/model-resolver.js";
const prisma = createPrismaClient();
await checkPostgreSQL(prisma);
console.log("postgresql smoke ok");
await prisma.$disconnect();
