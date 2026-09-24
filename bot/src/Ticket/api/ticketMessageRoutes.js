const { requireSession } = require('../../api/http/auth');
const { readJson, sendJson } = require('../../api/http/json');
const { clientError } = require('../../api/http/errors');

const UUID =
  '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';

const messagesRoute = new RegExp(
  `^/api/tickets/(${UUID})/messages$`,
);

const retryRoute = new RegExp(
  `^/api/tickets/(${UUID})/messages/(${UUID})/retry$`,
);

function validGuildId(guildId) {
  return /^\d{17,20}$/.test(guildId || '');
}

function validUuid(value) {
  return new RegExp(`^${UUID}$`).test(value || '');
}

async function handleRetry(
  request,
  response,
  {
    services,
    session,
    ticketId,
    messageId,
  },
) {
  if (request.method !== 'POST') {
    throw clientError(
      405,
      'Método não permitido.',
    );
  }

  const body = await readJson(request);

  if (
    Object.keys(body).some(
      key => key !== 'guildId',
    ) ||
    !validGuildId(body.guildId)
  ) {
    throw clientError(
      400,
      'Corpo de reenvio inválido.',
    );
  }

  await services.dashboard.requireGuildMembership(
    session,
    body.guildId,
  );

  requireSession(
    request,
    services,
  );

  const message =
    await services.ticketMessages.retryDelivery({
      guildId: body.guildId,
      ticketId,
      messageId,
      userId: session.user.id,
    });

  sendJson(
    response,
    200,
    {
      message:
        services.ticketMessages.dto(
          message,
        ),
    },
  );

  return true;
}

async function handleMessages(
  request,
  response,
  {
    services,
    session,
    ticketId,
    url,
  },
) {
  if (
    !['GET', 'POST'].includes(
      request.method,
    )
  ) {
    throw clientError(
      405,
      'Método não permitido.',
    );
  }

  if (request.method === 'GET') {
    const guildId =
      url.searchParams.get(
        'guildId',
      );

    const before =
      url.searchParams.get(
        'before',
      ) || undefined;

    const rawLimit =
      url.searchParams.get(
        'limit',
      );

    if (
      !validGuildId(guildId) ||
      (
        before &&
        !validUuid(before)
      )
    ) {
      throw clientError(
        400,
        'Parâmetros inválidos.',
      );
    }

    const limit =
      rawLimit == null
        ? 50
        : Number(rawLimit);

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw clientError(
        400,
        'limit deve estar entre 1 e 100.',
      );
    }

    await services.dashboard.requireGuildMembership(
      session,
      guildId,
    );

    requireSession(
      request,
      services,
    );

    const result =
      await services.ticketMessages.list({
        guildId,
        ticketId,
        userId: session.user.id,
        limit,
        before,
      });

    sendJson(
      response,
      200,
      result,
    );

    return true;
  }

  const body =
    await readJson(request);

  if (
    Object.keys(body).some(
      key =>
        ![
          'guildId',
          'clientMessageId',
          'content',
        ].includes(key),
    ) ||
    !validGuildId(body.guildId)
  ) {
    throw clientError(
      400,
      'Corpo de mensagem inválido.',
    );
  }

  await services.dashboard.requireGuildMembership(
    session,
    body.guildId,
  );

  requireSession(
    request,
    services,
  );

  const message =
    await services.ticketMessages.createWebMessage({
      guildId: body.guildId,
      ticketId,
      userId: session.user.id,
      clientMessageId:
        body.clientMessageId,
      content: body.content,
    });

  sendJson(
    response,
    200,
    {
      message:
        services.ticketMessages.dto(
          message,
        ),
    },
  );

  return true;
}

async function handle(
  request,
  response,
  { services },
) {
  const url = new URL(
    request.url,
    'http://localhost',
  );

  const retryMatch =
    url.pathname.match(
      retryRoute,
    );

  const messagesMatch =
    url.pathname.match(
      messagesRoute,
    );

  if (
    !retryMatch &&
    !messagesMatch
  ) {
    return false;
  }

  const session =
    requireSession(
      request,
      services,
    );

  response.setHeader(
    'Cache-Control',
    'no-store',
  );

  if (retryMatch) {
    const [
      ,
      ticketId,
      messageId,
    ] = retryMatch;

    return handleRetry(
      request,
      response,
      {
        services,
        session,
        ticketId,
        messageId,
      },
    );
  }

  const [, ticketId] =
    messagesMatch;

  return handleMessages(
    request,
    response,
    {
      services,
      session,
      ticketId,
      url,
    },
  );
}

module.exports = {
  handle,
};