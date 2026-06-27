function assertValidDate(value: Date, name: string): void {
  if (!Number.isFinite(value.getTime())) {
    throw new Error(`Countdown ${name} must be a valid Date`);
  }
}

export function getExpiresAt(startedAt: Date, durationMinutes: number): Date {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
    throw new Error("Countdown duration must be at least 1 minute");
  }
  assertValidDate(startedAt, "startedAt");

  return new Date(startedAt.getTime() + durationMinutes * 60_000);
}

export function getRemainingSeconds(now: Date, expiresAt: Date): number {
  assertValidDate(now, "now");
  assertValidDate(expiresAt, "expiresAt");

  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}
