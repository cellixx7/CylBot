import { useState } from 'react';

export default function MessageAvatar({ message }) {
  const [failed, setFailed] = useState(false);
  if (!['USER', 'STAFF'].includes(message.authorType)) return null;
  const initial = String(message.authorName || '?').trim().charAt(0).toUpperCase() || '?';
  return message.authorAvatarUrl && !failed ? (
    <img className="ticket-message-avatar" src={message.authorAvatarUrl} alt="" onError={() => setFailed(true)} />
  ) : <span className="ticket-message-avatar ticket-message-avatar-fallback" aria-hidden="true">{initial}</span>;
}
