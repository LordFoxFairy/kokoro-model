// 内置目录 seed 入口（`pnpm run seed:builtin`）：连库 → service → 幂等落地平台内置默认目录。
// 这是显式的管理/发布动作，不是服务启动钩子；本地 fast profile 不使用 LiteLLM 时不需要执行。
import { ModelService } from "../application/model-service.js";
import { PrismaModelRepository } from "../infrastructure/prisma/prisma-model-repository.js";
import { createPrismaClient } from "../infrastructure/prisma/prisma-client.js";
import { BUILTIN_CATALOG, seedBuiltinCatalog } from "./builtin-catalog.js";

const prisma = createPrismaClient();
try {
  const service = new ModelService(new PrismaModelRepository(prisma));
  const result = await seedBuiltinCatalog(service);
  // 只报形态与 id，不泄露凭据（secretRef 是 env 引用，本就不含明文）。
  console.log(
    `[seed:builtin] ok — provider=${BUILTIN_CATALOG.provider.key} binding=${result.bindingId} label=${result.label.key}`,
  );
} finally {
  await prisma.$disconnect();
}
