# UNO!

A single-table UNO-style card game for 2–8 people on their phones. Open the link, type a name and
you're in. It adds two cards to the classic deck:

- **Rotate**: every hand passes to the next player in the direction of play.
- **Swap**: trade your whole hand with any player you choose.

House rules: stacking (+2 on +2, +4 on +4, +4 on +2), jump-ins (play an identical card out of
turn), a 30 second turn timer that picks up for idle players, and removal after 5 automatic turns
in a row. The full rules and decisions are in [SPEC.md](SPEC.md).

## Development

Needs Node 24.

```sh
npm install
npm run dev        # server on :3001, Vite dev server on :5173 (proxies the game connection)
```

Open http://localhost:5173. To try it on your phone, open `http://<your computer's LAN IP>:5173`
on the same network. Each browser (or private window) is a separate player.

```sh
npm test           # rules engine, table and server tests
npm run typecheck
npm run build      # client into dist/client, server into dist/server
npm start          # serve the build on :3000
```

### How it fits together

| Path | What it does |
|---|---|
| `src/shared/` | Card definitions, play rules and message types used by both sides |
| `src/server/round.ts` | The rules engine for one game: a pure state machine that returns events |
| `src/server/table.ts` | Seats, reconnects, turn timers, idle strikes, joining/leaving, games back to back |
| `src/server/app.ts` | Fastify (static files, `/healthz`) and Socket.IO wiring |
| `src/client/` | React + Motion front end; `lib/fx.ts` turns server events into animations and sounds |

The server is authoritative and keeps everything in memory. Each phone only ever receives its own
hand. A random token in the phone's local storage lets a player reclaim their seat after a refresh
or a dropped connection.

## Deploying with Portainer and a Cloudflare tunnel

1. In Portainer: **Stacks → Add stack → Repository**. Point it at this repository and
   `docker-compose.yml` (add a GitHub token under authentication, since the repository is private).
   Portainer builds the image on the host from the `Dockerfile`.
2. Optionally set environment variables for the stack (see below).
3. Deploy. The game is published on port 3000 on all of the host's interfaces, so it's reachable
   on the LAN at `http://<server IP>:3000`.
4. In the Cloudflare dashboard, add a public hostname to your tunnel with service
   `http://<server IP>:3000`. WebSockets work through tunnels without extra settings.

To ship an update, push to `main` and redeploy the stack in Portainer (or turn on its GitOps
updates). Check on the first deploy that your Portainer version rebuilds the image from the
repository. A redeploy restarts the server, which ends any game in progress and resets the win
counts.

### Configuration

| Variable | Default | Meaning |
|---|---|---|
| `UNO_PORT` | `3000` | Host port the container is published on |
| `TURN_SECONDS` | `30` | Seconds per turn before a card is picked up automatically |
| `MAX_AUTO_TURNS` | `5` | Automatic turns in a row before a player is removed |
| `LOG_LEVEL` | `info` | Server log level (`warn`, `error`, `debug`, …) |

## Note

UNO is a trademark of Mattel. This is a private, non-commercial fan project with its own card art,
and isn't affiliated with or endorsed by Mattel.
