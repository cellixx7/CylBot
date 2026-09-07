const OpenAI = require('openai');

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 800;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'openai/gpt-4.1-mini';

class OpenRouterService {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.modelName = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
    this.maxTokens = Math.min(
      this.parseMaxTokens(process.env.OPENROUTER_MAX_TOKENS),
      DEFAULT_MAX_TOKENS,
    );
  }

  async generate({
    outputType,
    idea,
    originalContext = idea,
    additionalContext = '',
    currentText = '',
    targetCharacters = 2000,
  }) {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY não foi configurada no .env.');
    }

    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: OPENROUTER_BASE_URL,
    });
    let response;

    try {
      response = await this.withTimeout(client.chat.completions.create({
        model: this.modelName,
        messages: [{
          role: 'user',
          content: this.buildPrompt({
            outputType,
            idea,
            originalContext,
            additionalContext,
            currentText,
            targetCharacters,
          }),
        }],
        max_tokens: this.maxTokens,
        response_format: this.getResponseFormat(outputType),
      }));
    } catch (error) {
      if (error.status === 402 || error.statusCode === 402) {
        throw new Error('O limite de tokens ou créditos do OpenRouter foi excedido.');
      }
      throw error;
    }

    const rawText = response.choices?.[0]?.message?.content;
    console.log(`OpenRouter modelo utilizado: ${response.model || this.modelName}`);

    if (this.isProviderMetadata(rawText)) {
      this.logInvalidResponse(rawText, 'conteúdo de metadados do provider');
      throw new Error('O OpenRouter não retornou uma mensagem gerada pelo modelo.');
    }

    return this.validateOutput(this.parseJson(rawText), outputType);
  }

  getResponseFormat(outputType) {
    const schema = outputType === 'content'
      ? {
        type: 'object',
        additionalProperties: false,
        properties: { content: { type: 'string' } },
        required: ['content'],
      }
      : {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string' },
                value: { type: 'string' },
                inline: { type: 'boolean' },
              },
              required: ['name', 'value', 'inline'],
            },
          },
        },
        required: ['title', 'description', 'fields'],
      };

    return {
      type: 'json_schema',
      json_schema: {
        name: outputType === 'content' ? 'discord_content' : 'discord_embed',
        strict: true,
        schema,
      },
    };
  }

  isProviderMetadata(rawText) {
    if (typeof rawText !== 'string') return true;

    const normalized = rawText.trim().toLowerCase();
    return !normalized
      || /^user safety\s*:\s*\w+$/i.test(normalized)
      || /^safety\s*:\s*\w+$/i.test(normalized);
  }

  buildPrompt({ outputType, idea, originalContext, additionalContext, currentText, targetCharacters }) {
    return [
      'Escreva em pt-BR uma mensagem curta, clara e profissional para Discord.',
      'Melhore o texto atual; não recomece do zero sem necessidade.',
      'Não invente dados, evite emojis excessivos e não use menções.',
      'Para algo visual, você pode usar emojis Unicode ou aliases comuns do Discord como :warning:, :white_check_mark:, :tools:, :clock9: e :clown:. Não invente aliases.',
      'Retorne apenas JSON puro, sem markdown ou explicações.',
      `Formato: ${outputType === 'embed' ? 'Embed' : 'Content'}.`,
      outputType === 'embed'
        ? 'Use título, descrição e fields; fields pode ser vazio.'
        : 'Use Markdown compatível com Discord no campo content.',
      `Tamanho aproximado: ${targetCharacters} caracteres.`,
      `Contexto original: ${originalContext || idea}`,
      `Texto atual: ${currentText || '(ainda não existe)'}`,
      additionalContext ? `Novo contexto: ${additionalContext}` : '',
    ].join('\n');
  }

  parseMaxTokens(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_TOKENS;
  }

  parseJson(rawText) {
    if (typeof rawText !== 'string' || !rawText.trim()) {
      this.logInvalidResponse(rawText, 'resposta vazia');
      throw new Error('O OpenRouter não retornou conteúdo para interpretar.');
    }

    const candidates = [
      rawText.trim(),
      rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim(),
    ];

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {}
    }

    for (let start = 0; start < rawText.length; start += 1) {
      if (rawText[start] !== '{') continue;

      const end = this.findJsonObjectEnd(rawText, start);
      if (end === -1) continue;

      try {
        return JSON.parse(rawText.slice(start, end + 1));
      } catch {}
    }

    this.logInvalidResponse(rawText, 'JSON não encontrado');
    throw new Error('O OpenRouter retornou uma resposta em formato inválido.');
  }

  findJsonObjectEnd(value, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < value.length; index += 1) {
      const character = value[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === '\\') {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === '{') {
        depth += 1;
      } else if (character === '}') {
        depth -= 1;
        if (depth === 0) return index;
      }
    }

    return -1;
  }

  logInvalidResponse(rawText, reason) {
    const preview = typeof rawText === 'string'
      ? rawText.replace(/\s+/g, ' ').trim().slice(0, 500)
      : '[não textual]';
    const safePreview = this.apiKey ? preview.replaceAll(this.apiKey, '[REDACTED]') : preview;
    console.error(`Resposta inválida do OpenRouter (${reason}). Amostra: ${safePreview}`);
  }

  validateOutput(output, outputType) {
    if (outputType === 'content') {
      if (typeof output?.content !== 'string' || !output.content.trim()) {
        throw new Error('O OpenRouter não retornou um conteúdo válido.');
      }
      if (output.content.length > 2000) {
        throw new Error('O texto gerado ultrapassa o limite de 2.000 caracteres do Discord.');
      }
      return { content: output.content.trim() };
    }

    if (typeof output?.description !== 'string' || !output.description.trim()) {
      throw new Error('O OpenRouter não retornou uma descrição válida para o embed.');
    }
    if (output.title && output.title.length > 256) {
      throw new Error('O título gerado ultrapassa o limite do Discord.');
    }
    if (output.description.length > 4096) {
      throw new Error('A descrição gerada ultrapassa o limite do Discord.');
    }
    if (output.fields !== null && !Array.isArray(output.fields)) {
      throw new Error('A quantidade de campos do embed é inválida.');
    }

    const fields = (output.fields || []).map((field) => {
      if (!field || typeof field.name !== 'string' || typeof field.value !== 'string') {
        throw new Error('Um campo do embed é inválido.');
      }
      if (field.name.length > 256 || field.value.length > 1024) {
        throw new Error('Um campo do embed ultrapassa o limite do Discord.');
      }
      return {
        name: field.name,
        value: field.value,
        inline: Boolean(field.inline),
      };
    });

    if (fields.length > 25) {
      throw new Error('A quantidade de campos do embed é inválida.');
    }

    return {
      ...(output.title ? { title: output.title } : {}),
      description: output.description.trim(),
      fields,
    };
  }

  async withTimeout(promise) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('O OpenRouter demorou demais para responder.')), DEFAULT_TIMEOUT_MS);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

module.exports = OpenRouterService;