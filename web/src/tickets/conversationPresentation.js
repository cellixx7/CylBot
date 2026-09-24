export function isGroupedWithPrevious(message, previous) {
  if (!previous || message.authorType !== previous.authorType || message.authorName !== previous.authorName || message.isOwn !== previous.isOwn) return false;
  const elapsed = new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return elapsed >= 0 && elapsed <= 5 * 60 * 1000;
}
