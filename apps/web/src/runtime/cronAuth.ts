export function authorizeCronRequest(request: Request): Response | null {
  const expectedSecret = process.env.CRON_SECRET;
  const providedSecret = request.headers.get("x-cron-secret");

  if (!expectedSecret && process.env.NODE_ENV === "production") {
    return Response.json({ error: "Cron secret is not configured" }, { status: 503 });
  }

  if (expectedSecret && providedSecret !== expectedSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
