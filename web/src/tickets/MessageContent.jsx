import { messageSegments } from './messagePresentation.js';

export function linkedText(value, prefix = '') {
  return String(value).split(/(https?:\/\/[^\s<>]+)/g).map((part, index) => {
    if (!/^https?:\/\//.test(part)) return part;
    const trimmed = part.replace(/[.,;!?\)\]]+$/, '');
    try {
      const url = new URL(trimmed);
      if (!url.hostname || url.username || url.password || /[\u0000-\u0020\u007f\\]/.test(trimmed)) return part;
      return <span key={`${prefix}-${index}`}><a href={url.href} target="_blank" rel="noopener noreferrer">{trimmed}</a>{part.slice(trimmed.length)}</span>;
    } catch { return part; }
  });
}

export default function MessageContent({ content, mentions }) {
  return (
    <p className="ticket-content">
      {messageSegments(content, mentions).map((part, index) => part.type === 'mention' ? (
        <span className="ticket-mention" key={`${part.id}-${index}`}>@{part.name}</span>
      ) : linkedText(part.value, index))}
    </p>
  );
}
