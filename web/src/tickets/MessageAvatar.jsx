import { useState } from 'react';
import { Bot } from 'lucide-react';

export default function MessageAvatar({ message }) {
  const [failed, setFailed] = useState(false);
  if (message.authorType === 'AI') return <span className="ticket-message-avatar ticket-avatar-ai" aria-hidden="true"><Bot size={18} /></span>;
  if (!['USER', 'STAFF'].includes(message.authorType)) return null;
  const initial = String(message.authorName || '?').trim().charAt(0).toUpperCase() || '?';
  return message.authorAvatarUrl && !failed ? (
    <img className="ticket-message-avatar" src={message.authorAvatarUrl} alt="" onError={() => setFailed(true)} />
  ) : <span className="ticket-message-avatar ticket-message-avatar-fallback" aria-hidden="true">{initial}</span>;
}
