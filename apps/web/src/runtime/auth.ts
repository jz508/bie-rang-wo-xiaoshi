import { verifyEmailSessionToken } from "../services/emailAuthService";

export type AuthenticatedUser = {
  userId: string;
};

const DEVELOPMENT_USER_HEADER = "x-demo-user-id";
const BEARER_PREFIX = "Bearer ";

export function getAuthenticatedUser(request: Request): AuthenticatedUser | null {
  const token = getBearerToken(request);
  if (token) {
    try {
      return verifyEmailSessionToken(token, {
        now: new Date(),
        tokenSecret: getAuthTokenSecret(),
      });
    } catch {
      return null;
    }
  }

  if (!isDevelopmentHeaderAllowed()) {
    return null;
  }

  const userId = request.headers.get(DEVELOPMENT_USER_HEADER)?.trim();
  if (!userId) {
    return null;
  }

  return { userId };
}

export function requireAuthenticatedUser(request: Request): AuthenticatedUser | Response {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return Response.json({ error: "Authentication is required" }, { status: 401 });
  }

  return user;
}

export function isAuthResponse(value: AuthenticatedUser | Response): value is Response {
  return value instanceof Response;
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.startsWith(BEARER_PREFIX)) {
    return null;
  }

  return authorization.slice(BEARER_PREFIX.length).trim() || null;
}

function getAuthTokenSecret(): string {
  const secret =
    process.env.BIE_RANG_WO_XIAOSHI_TOKEN_SECRET ??
    process.env.TOKEN_SECRET ??
    (process.env.NODE_ENV === "production" ? undefined : "development-token-secret");

  if (!secret) {
    throw new Error("Token secret is not configured");
  }

  return secret;
}

function isDevelopmentHeaderAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}
