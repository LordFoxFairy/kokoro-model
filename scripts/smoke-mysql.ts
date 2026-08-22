import { createPrismaClient } from "../src/infrastructure/prisma/prisma-client.js";
import { checkMySQL } from "../src/infrastructure/mysql/model-resolver.js";
const prisma = createPrismaClient();
await checkMySQL(prisma);
console.log("mysql smoke ok");
await prisma.$disconnect();
