export function authorizeCronRequest(request: Request): Response | null {
  const expectedSecret = process.env.CRON_SECRET;
  const providedSecret = getProvidedCronSecret(request);

  if (!expectedSecret && process.env.NODE_ENV === "production") {
    return Response.json({ error: "Cron secret is not configured" }, { status: 503 });
  }

  if (expectedSecret && providedSecret !== expectedSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

function getProvidedCronSecret(request: Request): string | null {
  const headerSecret = request.headers.get("x-cron-secret");
  if (headerSecret) {
    return headerSecret;
  }

  const authorization = request.headers.get("authorization");
  const bearerPrefix = "Bearer ";
  if (authorization?.startsWith(bearerPrefix)) {
    return authorization.slice(bearerPrefix.length);
  }

  return null;
}
