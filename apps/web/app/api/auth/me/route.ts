import { isAuthResponse, requireAuthenticatedUser } from "../../../../src/runtime/auth";

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuthenticatedUser(request);
  if (isAuthResponse(auth)) {
    return auth;
  }

  return Response.json({
    user: {
      id: auth.userId,
    },
  });
}
