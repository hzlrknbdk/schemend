import { createSerializationAdapter } from "@tanstack/react-router";

export type RepositoryErrorKind =
	| "network"
	| "not-found"
	| "server"
	| "validation"
	| "auth"
	| "unknown";

/**
 * Common base for everything a Repository method can throw. HttpRepository throws one of its
 * subclasses directly, already carrying the right `kind` — this base exists so callers that
 * don't care which subclass (e.g. a generic catch) can still narrow with
 * `error instanceof RepositoryError`.
 */
export abstract class RepositoryError extends Error {
	abstract readonly kind: RepositoryErrorKind;
}

/** The request never reached a server: offline, DNS failure, connection refused. */
export class NetworkError extends RepositoryError {
	readonly kind = "network" as const;
}

/** The server responded, but not with the resource asked for (HTTP 404). */
export class NotFoundError extends RepositoryError {
	readonly kind = "not-found" as const;
}

/** The server responded with an error status other than 404. */
export class ServerError extends RepositoryError {
	readonly kind = "server" as const;

	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

/** The server responded, but the body doesn't match the shape Repository expects. */
export class ValidationError extends RepositoryError {
	readonly kind = "validation" as const;

	constructor(
		message: string,
		readonly detail: string,
	) {
		super(message);
	}
}

/** No access token in memory (local mode), or the server rejected it (HTTP 401). */
export class AuthError extends RepositoryError {
	readonly kind = "auth" as const;
}

/** Anything else — including a render error that never touched a Repository method. */
export class UnknownRepositoryError extends RepositoryError {
	readonly kind = "unknown" as const;
}

/**
 * The union every errorComponent switches on (conventions.md §11/§15). RepositoryError itself
 * is abstract, so this is what gives `kind` a real discriminant to narrow on.
 */
export type NormalizedError =
	| NetworkError
	| NotFoundError
	| ServerError
	| ValidationError
	| AuthError
	| UnknownRepositoryError;

/**
 * Used only by an errorComponent (see route-error-state.tsx) — a route's loader can throw
 * something that never went through Repository at all (a render error). Anything already one
 * of our subclasses passes through as-is; everything else becomes "unknown".
 */
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
