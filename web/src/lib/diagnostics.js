const enabled = import.meta.env.DEV;

export function logApi(event, details, level = 'info') {
  if (!enabled) return;
  const output = console[level] || console.info;
  output(`[CylBot] ${event}`, details);
}