export function authorizeCronRequest(request: Request): Response | null {
  const expectedSecrets = getExpectedCronSecrets();
  const providedSecret = getProvidedCronSecret(request);

  if (expectedSecrets.length === 0 && process.env.NODE_ENV === "production") {
    return Response.json({ error: "Cron secret is not configured" }, { status: 503 });
  }

  if (expectedSecrets.length > 0 && (!providedSecret || !expectedSecrets.includes(providedSecret))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

function getExpectedCronSecrets(): string[] {
  return [
    process.env.CRON_SECRET,
    process.env.BIE_RANG_TRIGGER_CRON_SECRET,
  ].flatMap((secret) => {
    const trimmed = secret?.trim();
    return trimmed ? [trimmed] : [];
  });
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
