// src/shutdown.js
// Graceful shutdown — fecha conexões abertas em até SHUTDOWN_GRACE_MS,
// força exit caso ultrapasse. Necessário para K8s rolling deploys.

import { config } from './config.js';

let shuttingDown = false;

export function registerShutdownHandlers(server, log, onShutdown) {
  const handler = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ msg: 'shutdown signal', signal });

    const grace = config.SHUTDOWN_GRACE_MS;
    const force = setTimeout(() => {
      log.error({ msg: 'shutdown forced after grace period', grace_ms: grace });
      process.exit(1);
    }, grace);
    force.unref();

    Promise.resolve()
      .then(() => onShutdown?.())
      .then(
        () =>
          new Promise((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
          }),
      )
      .then(() => {
        log.info({ msg: 'shutdown complete' });
        clearTimeout(force);
        process.exit(0);
      })
      .catch((err) => {
        log.error({ msg: 'shutdown error', error: err.message });
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => handler('SIGTERM'));
  process.on('SIGINT', () => handler('SIGINT'));

  process.on('uncaughtException', (err) => {
    log.error({ msg: 'uncaughtException', error: err.message, stack: err.stack });
    handler('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    log.error({ msg: 'unhandledRejection', reason: String(reason) });
  });
}

export function isShuttingDown() {
  return shuttingDown;
}
