const INVITE_REPEAT_BLOCK_MS = 30 * 24 * 60 * 60 * 1000;

export function canSendInvite(lastInviteAt: Date | null, now: Date): boolean {
  if (lastInviteAt === null) {
    return true;
  }

  return now.getTime() - lastInviteAt.getTime() >= INVITE_REPEAT_BLOCK_MS;
}
