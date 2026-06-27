export type AuthenticatedUser = {
  userId: string;
};

const DEVELOPMENT_USER_HEADER = "x-demo-user-id";

export function getAuthenticatedUser(request: Request): AuthenticatedUser | null {
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
