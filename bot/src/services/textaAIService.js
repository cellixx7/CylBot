const MAX_INPUT_LENGTH = 2000;
const invalid = message => Object.assign(new Error(message), { statusCode: 400 });

class TextaAIService {
  constructor({ ai, sessions }) {
    this.ai = ai;
    this.sessions = sessions;
  }

  async generate(input, { trimText = false, minTargetCharacters = 1, maxContextLength = Infinity } = {}) {
    // Opções fornecidas pelos adapters, nunca pelo body HTTP.
    // Preservam as diferenças existentes entre modal Discord e formulário Web.
    const text = value => typeof value === 'string' ? (trimText ? value.trim() : value) : '';
    const outputType = input?.outputType;
    const idea = text(input?.idea);
    const originalContext = text(input?.originalContext || idea);
    const additionalContext = text(input?.additionalContext);
    const currentText = text(input?.currentText);
    const targetCharacters = Number(input?.targetCharacters);

    if (!['content', 'embed'].includes(outputType)) throw invalid('Escolha Content ou Embed.');
    if (!idea || idea.length > MAX_INPUT_LENGTH) throw invalid('A ideia deve ter entre 1 e 2.000 caracteres.');
    if (originalContext.length > maxContextLength || additionalContext.length > MAX_INPUT_LENGTH || currentText.length > maxContextLength) {
      throw invalid('Os textos informados não podem ultrapassar 2.000 caracteres.');
    }
    if (!Number.isInteger(targetCharacters) || targetCharacters < minTargetCharacters || targetCharacters > MAX_INPUT_LENGTH) {
      throw invalid(`O tamanho deve ser um número entre ${minTargetCharacters} e 2.000 caracteres.`);
    }

    // O provider continua responsável pelo parsing e validação da saída gerada.
    return this.ai.generate({ outputType, idea, originalContext, additionalContext, currentText, targetCharacters });
  }

  create({ userId, channelId, outputType, idea, targetCharacters }) {
    return this.sessions.create({ userId, channelId, outputType, idea, originalContext: idea, targetCharacters });
  }

  beginRevision(id, userId) {
    return this.sessions.beginCorrection(id, userId);
  }

  claimRevision(id, userId, additionalContext) {
    const session = this.sessions.claimCorrection(id, userId);
    if (session) session.additionalContext = additionalContext;
    return session;
  }

  async generateSession(id, userId, claimedSession = null) {
    const session = claimedSession || this.sessions.claim(id, userId);
    if (!session) return null;
    try {
      session.generated = await this.generate(session);
      session.currentText = session.outputType === 'embed'
        ? [session.generated.title, session.generated.description].filter(Boolean).join('\n')
        : session.generated.content;
      // Mantém a ativação sem renovar o TTL ao concluir a geração.
      session.status = 'active';
      return session;
    } catch (error) {
      this.sessions.remove(id);
      throw error;
    }
  }

  claimForSend(id, userId, channelId) {
    const session = this.sessions.claim(id, userId);
    if (!session) return null;
    if (channelId !== session.channelId) {
      this.sessions.release(id, userId);
      throw Object.assign(new Error('Canal diferente do original.'), { code: 'TEXTA_WRONG_CHANNEL' });
    }
    return session;
  }

  markSent(id, userId) {
    return this.sessions.markSent(id, userId);
  }

  release(id, userId) {
    return this.sessions.release(id, userId);
  }

  discard(id) {
    this.sessions.remove(id);
  }

  getStatus(id, userId) {
    return this.sessions.getStatus(id, userId);
  }
}

module.exports = { TextaAIService };
