import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";

// 四类调用主体；header 是外部边界，用 Zod 洗净。
export const principalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), userId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("service"), serviceAccountId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("operator"), operatorId: z.string().min(1), roleKey: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("system") }).strict(),
]);

export type Principal = z.infer<typeof principalSchema>;

const SYSTEM_PRINCIPAL: Principal = { kind: "system" };

export interface RequestContext {
  requestId: string;
  tenantId: string | null;
  principal: Principal;
  teamId?: string;
}

const HEADER_REQUEST_ID = "x-kokoro-request-id";
const HEADER_TENANT_ID = "x-kokoro-tenant-id";
const HEADER_TEAM_ID = "x-kokoro-team-id";
const HEADER_PRINCIPAL = "x-kokoro-principal";

export class SiteContextRequiredError extends Error {
  constructor() {
    super("tenantId is required for this operation");
    this.name = "SiteContextRequiredError";
  }
}

function headerValue(headers: IncomingHttpHeaders, key: string): string | undefined {
  const raw = headers[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

// 脏 principal header 降级为 system 而非崩溃；真正的鉴权边界在网关，模块侧只用它做审计归属。
function parsePrincipal(raw: string | undefined): Principal {
  if (!raw) {
    return SYSTEM_PRINCIPAL;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return SYSTEM_PRINCIPAL;
  }
  const result = principalSchema.safeParse(json);
  return result.success ? result.data : SYSTEM_PRINCIPAL;
}

export function readRequestContext(headers: IncomingHttpHeaders): RequestContext {
  const requestId = headerValue(headers, HEADER_REQUEST_ID) ?? randomUUID();
  const tenantId = headerValue(headers, HEADER_TENANT_ID) ?? null;
  const principal = parsePrincipal(headerValue(headers, HEADER_PRINCIPAL));
  const teamId = headerValue(headers, HEADER_TEAM_ID);
  return teamId === undefined
    ? { requestId, tenantId, principal }
    : { requestId, tenantId, principal, teamId };
}

export function requireSite(context: RequestContext): string {
  if (context.tenantId === null) {
    throw new SiteContextRequiredError();
  }
  return context.tenantId;
}

// 序列化为出站 header，供跨服务调用透传链路上下文。
export function contextHeaders(context: RequestContext): Record<string, string> {
  const headers: Record<string, string> = {
    [HEADER_REQUEST_ID]: context.requestId,
    [HEADER_PRINCIPAL]: JSON.stringify(context.principal),
  };
  if (context.tenantId !== null) {
    headers[HEADER_TENANT_ID] = context.tenantId;
  }
  if (context.teamId !== undefined) {
    headers[HEADER_TEAM_ID] = context.teamId;
  }
  return headers;
}
