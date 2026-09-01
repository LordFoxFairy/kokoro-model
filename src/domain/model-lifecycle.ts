export interface DeletionAudit {
  deletedAt: Date | null;
  deletedBy: string | null;
  deleteReason: string | null;
}

export interface DeleteInput {
  id: string;
  deletedBy: string;
  reason?: string | undefined;
}

export interface RestoreInput {
  id: string;
}

export interface ListOptions {
  includeDeleted?: boolean | undefined;
}

export type ModelLifecycleErrorCode =
  | "model.provider_account.not_found"
  | "model.provider_account.deleted"
  | "model.binding.not_found"
  | "model.binding.deleted"
  | "model.invalid_cursor"
  | "model.invalid_page";

export class ModelLifecycleError extends Error {
  constructor(
    public readonly code: ModelLifecycleErrorCode,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ModelLifecycleError";
  }
}

export function isModelLifecycleError(error: unknown): error is ModelLifecycleError {
  return error instanceof ModelLifecycleError;
}

export class ModelDependencyError extends Error {
  readonly code = "model.dependencies_unavailable" as const;
  readonly statusCode = 503;

  constructor(message = "model dependencies are unavailable") {
    super(message);
    this.name = "ModelDependencyError";
  }
}

export function isModelDependencyError(error: unknown): error is ModelDependencyError {
  return error instanceof ModelDependencyError;
}
