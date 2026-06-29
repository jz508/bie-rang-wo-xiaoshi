import { createPrismaMvpRepository } from "../../../src/repositories/prismaMvpRepository";
import { isAuthResponse, requireAuthenticatedUser } from "../../../src/runtime/auth";

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuthenticatedUser(request);
  if (isAuthResponse(auth)) {
    return auth;
  }

  try {
    const repository = createPrismaMvpRepository();
    const contacts = await repository.findContactsByUserId(auth.userId);

    return Response.json({ contacts });
  } catch {
    return Response.json({ error: "Failed to load contacts" }, { status: 500 });
  }
}
