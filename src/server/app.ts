import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import type { Ack, ClientMessages } from '../shared/protocol';
import type { Table, TableClient } from './table';

/** Messages allowed per socket per window, so one phone can't flood the table. */
const RATE_LIMIT = { messages: 40, windowMs: 5_000 };

type Handler<K extends keyof ClientMessages> = (client: TableClient, payload: Partial<ClientMessages[K]>) => Ack;

export interface AppOptions {
  table: Table;
  /** Directory holding the built client; skipped when it has no index.html. */
  clientDir?: string;
  logLevel?: string;
}

export async function createApp({ table, clientDir, logLevel = 'info' }: AppOptions): Promise<{
  app: FastifyInstance;
  io: Server;
}> {
  const app = Fastify({ logger: { level: logLevel }, trustProxy: true });

  app.get('/healthz', async () => ({ ok: true, phase: table.phase }));

  if (clientDir && existsSync(resolve(clientDir, 'index.html'))) {
    const assetsDir = resolve(clientDir, 'assets');
    await app.register(fastifyStatic, {
      root: clientDir,
      wildcard: false,
      cacheControl: false,
      setHeaders(reply, path) {
        // Vite fingerprints everything in /assets; the page itself must always be fresh.
        reply.header(
          'Cache-Control',
          path.startsWith(assetsDir) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
    app.setNotFoundHandler((_request, reply) => reply.sendFile('index.html'));
  } else if (clientDir) {
    app.log.warn(`No client build in ${clientDir}; serving the game connection only`);
  }

  const io = new Server(app.server, {
    serveClient: false,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    maxHttpBufferSize: 4_096,
  });

  const handlers: { [K in keyof ClientMessages]: Handler<K> } = {
    hello: (client, p) => table.hello(client, p.token),
    join: (client, p) => table.join(client, p.name, p.avatar),
    leave: (client) => table.leave(client),
    play: (client, p) => table.play(client, p.cardId),
    draw: (client) => table.draw(client),
    pass: (client) => table.pass(client),
    chooseColor: (client, p) => table.chooseColor(client, p.color),
    chooseSwap: (client, p) => table.chooseSwap(client, p.targetId),
    react: (client, p) => table.react(client, p.emoji),
  };

  io.on('connection', (socket) => {
    const client: TableClient = {
      id: socket.id,
      send: (event: string, payload: unknown) => socket.emit(event, payload),
    };
    let windowStart = Date.now();
    let count = 0;

    table.connect(client);

    for (const [message, handler] of Object.entries(handlers) as [keyof ClientMessages, Handler<never>][]) {
      socket.on(message, (payload: unknown, ack?: unknown) => {
        const now = Date.now();
        if (now - windowStart > RATE_LIMIT.windowMs) {
          windowStart = now;
          count = 0;
        }
        let result: Ack;
        if (++count > RATE_LIMIT.messages) {
          result = { ok: false, error: 'Too many messages' };
        } else {
          try {
            result = handler(client, (payload && typeof payload === 'object' ? payload : {}) as never);
          } catch (error) {
            app.log.error({ err: error, message }, 'Message handler failed');
            result = { ok: false, error: 'Something went wrong' };
          }
        }
        if (typeof ack === 'function') ack(result);
      });
    }

    socket.on('disconnect', () => table.disconnect(client));
  });

  app.addHook('onClose', async () => {
    table.dispose();
    io.disconnectSockets(true);
  });

  return { app, io };
}
