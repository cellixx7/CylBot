const mentionToken = /<@!?(\d{17,20})>/g;

export function messageSegments(content, mentions = []) {
  const people = new Map(mentions.map(person => [person.id, person]));
  const parts = [];
  let index = 0;
  for (const match of String(content || '').matchAll(mentionToken)) {
    if (match.index > index) parts.push({ type: 'text', value: content.slice(index, match.index) });
    const person = people.get(match[1]);
    parts.push(person ? { type: 'mention', id: person.id, name: person.name } : { type: 'text', value: match[0] });
    index = match.index + match[0].length;
  }
  if (index < String(content || '').length) parts.push({ type: 'text', value: content.slice(index) });
  return parts;
}

export function shouldSubmitOnEnter({ key, shiftKey, isComposing, sending, retryPending, draft }) {
  return key === 'Enter' && !shiftKey && !isComposing && !sending && !retryPending && Boolean(String(draft || '').trim());
}

export function mentionQuery(draft) {
  return String(draft || '').match(/(?:^|\s)@([^\s@]*)$/)?.[1] ?? null;
}

export function insertMention(draft, participant) {
  return String(draft || '').replace(/@[^\s@]*$/, `<@${participant.id}>`);
}
