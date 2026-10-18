import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Ack, TableView, UpdatePayload } from '../src/shared/protocol';
import { createApp } from '../src/server/app';
import { Table } from '../src/server/table';
import { seeded } from './helpers';

let url = '';
let close: () => Promise<void>;

beforeAll(async () => {
  const table = new Table({ rng: seeded(3), countdownMs: 50 });
  const { app } = await createApp({ table, logLevel: 'silent' });
  await app.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = () => app.close();
});

afterAll(async () => {
  await close();
});

interface Player {
  socket: Socket;
  view: TableView | null;
  send(message: string, payload?: object): Promise<Ack>;
  until(predicate: (view: TableView) => boolean): Promise<TableView>;
}

function player(n: number): Player {
  const socket = connect(url, { transports: ['websocket'], forceNew: true });
  const p: Player = {
    socket,
    view: null,
    send: (message, payload = {}) => socket.emitWithAck(message, payload),
    until: (predicate) =>
      new Promise((resolve) => {
        if (p.view && predicate(p.view)) return resolve(p.view);
        const listener = ({ view }: UpdatePayload) => {
          if (predicate(view)) {
            socket.off('update', listener);
            resolve(view);
          }
        };
        socket.on('update', listener);
      }),
  };
  socket.on('update', ({ view }: UpdatePayload) => {
    p.view = view;
  });
  socket.on('connect', () => void p.send('hello', { token: `integration-token-${n}-xxxxxxxx` }));
  return p;
}

describe('static files', () => {
  it('serves the page and assets, and 404s missing assets instead of sending the page', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uno-client-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>UNO!</title>');
    const { app } = await createApp({ table: new Table(), clientDir: dir, logLevel: 'silent' });
    try {
      const page = await app.inject('/');
      expect(page.headers['content-type']).toMatch(/text\/html/);
      expect(page.headers['cache-control']).toBe('no-cache');

      // Files that appear after startup (a rebuild) are served too.
      writeFileSync(join(dir, 'assets', 'app-123.js'), 'console.log(1)');
      const asset = await app.inject('/assets/app-123.js');
      expect(asset.statusCode).toBe(200);
      expect(asset.headers['content-type']).toMatch(/javascript/);
      expect(asset.headers['cache-control']).toContain('immutable');

      expect((await app.inject('/assets/gone-456.js')).statusCode).toBe(404);
      expect((await app.inject('/somewhere')).body).toContain('<title>UNO!</title>');
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('server', () => {
  it('answers health checks', async () => {
    const response = await fetch(`${url}/healthz`);
    expect(await response.json()).toEqual({ ok: true, phase: 'waiting' });
  });

  it('plays a turn over real sockets', async () => {
    const a = player(1);
    const b = player(2);
    await a.until(() => true);
    await b.until(() => true);
    expect(await a.send('join', { name: 'Ana', avatar: '🦊' })).toEqual({ ok: true });
    expect(await b.send('join', { name: 'Bo', avatar: '🐸' })).toEqual({ ok: true });

    const view = await a.until((v) => v.phase === 'playing');
    expect(view.me?.hand).toHaveLength(7);
    const current = view.currentPlayerId === a.view!.me!.id ? a : b;
    const other = current === a ? b : a;

    expect(await other.send('draw')).toEqual({ ok: false, error: "It's not your turn" });
    expect(await current.send('draw')).toEqual({ ok: true });
    const after = await other.until((v) => v.players.some((p) => p.cardCount === 8));
    expect(after.me?.hand).toHaveLength(7);

    expect(await a.send('play', { cardId: 'nonsense' })).toEqual({ ok: false, error: 'Bad card' });
    a.socket.close();
    b.socket.close();
  });
});
