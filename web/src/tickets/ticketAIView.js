export function ticketAIStatusText(status) {
  if (!status.available) return 'IA de tickets indisponível para este servidor.';
  if (status.escalated) return 'Atendimento humano solicitado';
  if (status.paused) return 'Pausada manualmente';
  if (status.enabled) return `Ativa · Nível ${status.autonomyLevel}`;
  return 'Desativada no servidor';
}

export function ticketAIControlsEnabled(status, active) {
  return Boolean(active && status.available);
}
