import { messageSegments } from './messagePresentation.js';

export default function MessageContent({ content, mentions }) {
  return (
    <p className="ticket-content">
      {messageSegments(content, mentions).map((part, index) => part.type === 'mention' ? (
        <span className="ticket-mention" key={`${part.id}-${index}`}>@{part.name}</span>
      ) : part.value)}
    </p>
  );
}
