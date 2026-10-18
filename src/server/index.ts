import { resolve } from 'node:path';
import { createApp } from './app';
import { DEFAULT_OPTIONS, Table } from './table';

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const table = new Table({
  turnMs: envNumber('TURN_SECONDS', DEFAULT_OPTIONS.turnMs / 1000) * 1000,
  maxStrikes: envNumber('MAX_AUTO_TURNS', DEFAULT_OPTIONS.maxStrikes),
});

const { app } = await createApp({
  table,
  clientDir: resolve(process.env.CLIENT_DIR ?? 'dist/client'),
  logLevel: process.env.LOG_LEVEL ?? 'info',
});

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: envNumber('PORT', 3000), host: process.env.HOST ?? '0.0.0.0' });
