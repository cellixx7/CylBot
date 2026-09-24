export function mergeTicketMessages(serverMessages = [], localMessages = []) {
  const messages = new Map();

  for (const message of serverMessages) {
    messages.set(message.id, message);
  }

  for (const message of localMessages) {
    messages.set(message.id, {
      ...messages.get(message.id),
      ...message,
    });
  }

  return [...messages.values()].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() -
      new Date(right.createdAt).getTime(),
  );
}

export function isLocalMessageConfirmed(localMessage, serverMessages = []) {
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