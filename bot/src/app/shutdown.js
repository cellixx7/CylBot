function createShutdown({
  getServer,
  getClient,
  logger,
  timeoutMs = 10000,
  exit = code => process.exit(code),
}) {
  let shutdownPromise;

  const attempt = async (resource, action) => {
    try {
      await action();
    } catch (error) {
      logger.error('app.shutdown_resource_failed', {
        resource,
        error: { name: error?.name || 'Error', message: 'cleanup failed' },
      });
    }
  };

  return signal => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      logger.info('app.shutdown_started', { signal });
      let timeout;
      let timedOut = false;
      const client = getClient();
      const services = client?.services;

      const cleanup = (async () => {
        const server = getServer();
        await attempt('api', async () => {
          if (!server?.listening) return;
          if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
          await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        });
        await attempt('discord', async () => {
          if (typeof client?.destroy === 'function') await client.destroy();
        });
        await attempt('ticket_ai', async () => {
          if (typeof services?.ticketAIMessages?.stop === 'function') await services.ticketAIMessages.stop();
        });
        await attempt('database', async () => {
          if (typeof services?.database?.close === 'function') await services.database.close();
        });
      })();

      const fallback = new Promise(resolve => {
        timeout = setTimeout(() => {
          timedOut = true;
          logger.error('app.shutdown_timeout', { signal, timeoutMs });
          try { exit(1); } catch { /* process termination can be mocked in tests */ }
          resolve();
        }, timeoutMs);
      });

      await Promise.race([cleanup, fallback]);
      clearTimeout(timeout);
      if (!timedOut) logger.info('app.shutdown_completed', { signal });
    })();
    return shutdownPromise;
  };
}

module.exports = { createShutdown };
