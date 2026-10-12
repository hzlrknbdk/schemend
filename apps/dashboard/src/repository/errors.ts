import { createSerializationAdapter } from "@tanstack/react-router";

export type RepositoryErrorKind =
  | "network"
  | "not-found"
  | "server"
  | "validation"
  | "auth"
  | "unknown";

export abstract class RepositoryError extends Error {
  abstract readonly kind: RepositoryErrorKind;
}

export class NetworkError extends RepositoryError {
  readonly kind = "network" as const;
}

export class NotFoundError extends RepositoryError {
  readonly kind = "not-found" as const;
}

export class ServerError extends RepositoryError {
  readonly kind = "server" as const;

  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class ValidationError extends RepositoryError {
  readonly kind = "validation" as const;

  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
  }
}

export class AuthError extends RepositoryError {
  readonly kind = "auth" as const;
}

export class UnknownRepositoryError extends RepositoryError {
  readonly kind = "unknown" as const;
}

export type NormalizedError =
  | NetworkError
  | NotFoundError
  | ServerError
  | ValidationError
  | AuthError
  | UnknownRepositoryError;

export function normalizeError(error: unknown): NormalizedError {
  if (
    error instanceof NetworkError ||
    error instanceof NotFoundError ||
    error instanceof ServerError ||
    error instanceof ValidationError ||
    error instanceof AuthError ||
    error instanceof UnknownRepositoryError
  ) {
    return error;
  }
  return new UnknownRepositoryError(
    error instanceof Error ? error.message : "Unknown error",
  );
}

interface SerializedRepositoryError {
  kind: RepositoryErrorKind;
  message: string;
  status?: number;
  detail?: string;
}

/**
 * Without this, a RepositoryError thrown during the server render crosses to the client as a
 * plain `Error` (subclass and `kind` lost) — TanStack Start's SSR payload only round-trips
 * types it knows how to serialize. Registered on the router (see router.tsx) so loader errors
 * keep their real `kind` on the client, where errorComponent/normalizeError need it.
 */
export const repositoryErrorSerializationAdapter = createSerializationAdapter({
  key: "schemend:repository-error",
  test: (value): value is NormalizedError =>
    value instanceof NetworkError ||
    value instanceof NotFoundError ||
    value instanceof ServerError ||
    value instanceof ValidationError ||
    value instanceof AuthError ||
    value instanceof UnknownRepositoryError,
  toSerializable: (error): SerializedRepositoryError => {
    switch (error.kind) {
      case "server":
        return {
          kind: error.kind,
          message: error.message,
          status: error.status,
        };
      case "validation":
        return {
          kind: error.kind,
          message: error.message,
          detail: error.detail,
        };
      case "network":
      case "not-found":
      case "auth":
      case "unknown":
        return { kind: error.kind, message: error.message };
      default:
        return error satisfies never;
    }
  },
  fromSerializable: (data): NormalizedError => {
    switch (data.kind) {
      case "network":
        return new NetworkError(data.message);
      case "not-found":
        return new NotFoundError(data.message);
      case "server":
        return new ServerError(data.message, data.status ?? 0);
      case "validation":
        return new ValidationError(data.message, data.detail ?? "");
      case "auth":
        return new AuthError(data.message);
      case "unknown":
        return new UnknownRepositoryError(data.message);
      default:
        return data.kind satisfies never;
    }
  },
});
