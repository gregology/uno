import { io } from 'socket.io-client';
import type { Ack, ClientMessage, ClientMessages, Notice, TableView, UpdatePayload } from '../../shared/protocol';
import { handleEvents } from './fx';
import { getToken } from './prefs';
import { createStore } from './store';

export interface ConnectionState {
  online: boolean;
  view: TableView | null;
  /** Local Date.now() when the view arrived, to turn the server's "ms remaining" into deadlines. */
  receivedAt: number;
  notice: Notice | null;
}

export const connection = createStore<ConnectionState>({
  online: false,
  view: null,
  receivedAt: 0,
  notice: null,
});

const socket = io({ reconnectionDelayMax: 3_000 });

socket.on('connect', () => {
  connection.set((s) => ({ ...s, online: true }));
  hello();
});

socket.on('disconnect', () => {
  connection.set((s) => ({ ...s, online: false }));
});

socket.on('update', ({ events, view }: UpdatePayload) => {
  handleEvents(events, connection.get().view, view);
  connection.set((s) => ({ ...s, view, receivedAt: Date.now() }));
});

socket.on('notice', (notice: Notice) => {
  connection.set((s) => ({ ...s, notice }));
});

/** Tell the server who this phone is, reclaiming its seat if it has one. */
export function hello(): void {
  void send('hello', { token: getToken() });
}

export function clearNotice(): void {
  connection.set((s) => ({ ...s, notice: null }));
}

export async function send<K extends ClientMessage>(message: K, payload: ClientMessages[K]): Promise<Ack> {
  try {
    return (await socket.timeout(5_000).emitWithAck(message, payload)) as Ack;
  } catch {
    return { ok: false, error: 'No connection to the table' };
  }
}
