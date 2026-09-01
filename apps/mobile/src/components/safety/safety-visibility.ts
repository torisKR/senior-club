export function shouldShowContentSafetyActions(
  authorUserId: string,
  currentUserId: string | undefined,
) {
  return Boolean(currentUserId && authorUserId !== currentUserId);
}
