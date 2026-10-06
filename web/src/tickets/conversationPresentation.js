export function isGroupedWithPrevious(message, previous) {
  if (previous && new Date(message.createdAt).toDateString() !== new Date(previous.createdAt).toDateString()) return false;
  if (!previous || message.authorType !== previous.authorType || message.authorName !== previous.authorName || message.isOwn !== previous.isOwn) return false;
  if (message.origin !== previous.origin || message.visibility !== previous.visibility) return false;
  const elapsed = new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return elapsed >= 0 && elapsed <= 5 * 60 * 1000;
}
export function conversationDay(value, now = new Date()) {
  const day = new Date(value);
  if (day.toDateString() === now.toDateString()) return 'Hoje';
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (day.toDateString() === yesterday.toDateString()) return 'Ontem';
  return day.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
