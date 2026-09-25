const { clientError } = require('../../api/http/errors');
const CAPABILITIES = Object.freeze({ REPLY: 'reply', ASK_CLARIFICATION: 'ask_clarifying_question', SUMMARIZE: 'summarize',
  ESCALATE_TO_HUMAN: 'request_human', SUGGEST_CLOSE: 'suggest_close', NO_ACTION: null });
const REASONS = ['user_question_answered', 'clarification_needed', 'summary_requested', 'resolution_suggested', 'no_action',
  'user_requested_human', 'low_confidence', 'policy_restriction', 'unsupported_request', 'sensitive_action_required', 'repeated_failure'];
const DEFAULT_CONFIG = Object.freeze({ enabled: false, autonomyLevel: 0, assistantName: 'CylBot', tone: 'cordial', language: 'pt-BR',
  serverContext: '', supportInstructions: '', humanEscalationEnabled: true, inactivityTimeoutSeconds: 900,
  capabilities: Object.freeze(Object.values(CAPABILITIES).filter(Boolean)) });
const AI_HANDOFF_MESSAGE = 'Eu não tenho capacidade para fazer isso. Uma pessoa da equipe poderá te auxiliar. Meu atendimento foi pausado e a equipe foi notificada.';
const OUTPUT_SCHEMA = { type: 'object', additionalProperties: false,
  required: ['message', 'action', 'confidence', 'reason', 'requiresHuman'], properties: {
    message: { type: 'string', maxLength: 1600 }, action: { type: 'string', enum: Object.keys(CAPABILITIES) },
    confidence: { type: 'number', minimum: 0, maximum: 1 }, reason: { type: 'string', enum: REASONS }, requiresHuman: { type: 'boolean' },
  } };
function validateOutput(raw) {
  if (typeof raw !== 'string' || raw.length > 10000) throw new Error('TICKET_AI_INVALID_OUTPUT');
  const value = JSON.parse(raw);
  if (!value || Array.isArray(value) || Object.keys(value).sort().join() !== [...OUTPUT_SCHEMA.required].sort().join()
    || !Object.hasOwn(CAPABILITIES, value.action) || typeof value.message !== 'string' || value.message.length > 1600
    || (value.action !== 'NO_ACTION' && !value.message.trim()) || typeof value.confidence !== 'number'
    || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1
    || !REASONS.includes(value.reason) || typeof value.requiresHuman !== 'boolean') throw new Error('TICKET_AI_INVALID_OUTPUT');
  return { ...value, message: value.message.trim() };
}
function normalizeHandoff(proposal) {
  const normalized = String(proposal.message || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const inability = /(?:nao (?:tenho|possuo) (?:capacidade|permissao|acesso|como)|nao posso (?:ajudar|fazer|resolver|atender)|fora do meu escopo|precisa(?:ra)? (?:de )?(?:um )?(?:humano|atendente|pessoa))/.test(normalized);
  if (proposal.action === 'ESCALATE_TO_HUMAN' || proposal.requiresHuman || proposal.confidence < 0.6
    || ['unsupported_request', 'repeated_failure'].includes(proposal.reason) || inability) {
    const reason = inability ? 'unsupported_request' : proposal.confidence < 0.6 ? 'low_confidence'
      : ['user_requested_human', 'unsupported_request', 'repeated_failure', 'sensitive_action_required'].includes(proposal.reason)
        ? proposal.reason : 'unsupported_request';
    return { ...proposal, message: AI_HANDOFF_MESSAGE, action: 'ESCALATE_TO_HUMAN', requiresHuman: true, reason };
  }
  return proposal;
}
function validateConfig(value) {
  const invalid = () => { throw clientError(400, 'Configuração de IA inválida. Confira campos, capacidades e limites.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(DEFAULT_CONFIG, key))) invalid();
  const result = { ...DEFAULT_CONFIG, ...value };
  if (typeof result.enabled !== 'boolean' || typeof result.humanEscalationEnabled !== 'boolean'
    || !Number.isInteger(result.autonomyLevel) || result.autonomyLevel < 0 || result.autonomyLevel > 3
    || !Number.isInteger(result.inactivityTimeoutSeconds) || result.inactivityTimeoutSeconds < 5 || result.inactivityTimeoutSeconds > 86400) invalid();
  for (const [key, max] of Object.entries({ assistantName: 40, tone: 80, language: 20, serverContext: 2000, supportInstructions: 2000 })) {
    if (typeof result[key] !== 'string' || result[key].length > max || (['assistantName', 'tone', 'language'].includes(key) && !result[key].trim())) invalid();
    result[key] = result[key].trim();
  }
  if (!Array.isArray(result.capabilities) || result.capabilities.length > 5
    || result.capabilities.some(capability => !DEFAULT_CONFIG.capabilities.includes(capability))) invalid();
  result.capabilities = [...new Set(result.capabilities)];
  return result;
}
function humanRequested(text) {
  const normalized = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /(?:quero|preciso|prefiro|gostaria).{0,45}(?:humano|pessoa|atendente)|(?:chama|chame|chamar).{0,20}(?:suporte|atendente|humano)|nao quero.{0,25}(?:bot|robo|ia)|(?:talk|speak).{0,20}(?:human|person|agent)/.test(normalized);
}
const noAction = reason => ({ message: '', action: 'NO_ACTION', confidence: 0, reason, requiresHuman: false });
module.exports = { CAPABILITIES, DEFAULT_CONFIG, OUTPUT_SCHEMA, AI_HANDOFF_MESSAGE, validateOutput, normalizeHandoff, validateConfig, humanRequested, noAction };
