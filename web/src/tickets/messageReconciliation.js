export function isLocalMessageConfirmed(
  localMessage,
  serverMessages = [],
) {
  const serverMessage = serverMessages.find(
    message => message.id === localMessage.id,
  );

  if (!serverMessage) {
    return false;
  }

  return (
    serverMessage.deliveryStatus === localMessage.deliveryStatus &&
    serverMessage.content === localMessage.content
  );
}

export function mergeTicketMessages(
  serverMessages = [],
  localMessages = [],
) {
  const messages = new Map();

  for (const message of serverMessages) {
    messages.set(message.id, message);
  }

  for (const localMessage of localMessages) {
    const serverMessage = messages.get(localMessage.id);

    if (
      serverMessage &&
      isLocalMessageConfirmed(
        localMessage,
        serverMessages,
      )
    ) {
      continue;
    }

    messages.set(localMessage.id, {
      ...serverMessage,
      ...localMessage,
    });
  }

  return [...messages.values()].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() -
      new Date(right.createdAt).getTime(),
  );
}

export const ticketConversationMode = status =>
  status === 'CLOSED' ? 'history' : 'chat';
