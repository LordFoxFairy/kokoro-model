export interface PageInput {
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
}

export interface PageResult<T> {
  readonly items: T[];
  readonly nextCursor?: string;
}

interface CursorPayload {
  readonly version: 1;
  readonly resource: string;
  readonly scope: string;
  readonly offset: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Uses an opaque, scoped cursor over a deterministically ordered snapshot.
 * Repository queries own the ordering; this helper only applies the bounded window.
 */
export function pageWindow<T>(resource: string, values: readonly T[], page: PageInput = {}): PageResult<T> {
  const limit = page.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error("model.invalid_page");
  }

  const scope = pageScope(values);
  const offset = page.cursor === undefined ? 0 : decodeCursor(resource, scope, page.cursor);
  if (offset > values.length) throw new Error("model.invalid_cursor");
  const items = values.slice(offset, offset + limit);
  if (offset + items.length >= values.length) {
    return { items };
  }

  return {
    items,
    nextCursor: encodeCursor({ version: 1, resource, scope, offset: offset + items.length }),
  };
}

function pageScope(values: readonly unknown[]): string {
  // The scope is intentionally small and opaque; it prevents replaying a cursor against a different
  // in-memory result set while avoiding business data in the token.
  return `${values.length}:${values[0] === undefined ? "" : stableValue(values[0])}:${values.at(-1) === undefined ? "" : stableValue(values.at(-1))}`;
}

function stableValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  return JSON.stringify(value);
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(resource: string, scope: string, value: string): number {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (decoded === null || typeof decoded !== "object") throw new Error();
    const cursor = decoded as Record<string, unknown>;
    if (
      cursor.version !== 1 ||
      cursor.resource !== resource ||
      cursor.scope !== scope ||
      typeof cursor.offset !== "number" ||
      !Number.isInteger(cursor.offset) ||
      cursor.offset < 0
    ) {
      throw new Error();
    }
    return cursor.offset;
  } catch {
    throw new Error("model.invalid_cursor");
  }
}
