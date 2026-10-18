# UNO table: game spec

A single online table for 2–8 players, played on phones. No lobbies or accounts: open the link,
type a name and you're in.

## Deck (116 cards)

The classic 108-card deck plus one **Rotate** and one **Swap** in each colour.

| Per colour | Count |
|---|---|
| 0 | 1 |
| 1–9 | 2 each |
| Skip, Reverse, Draw Two | 2 each |
| Rotate, Swap | 1 each |

Plus 4 Wild and 4 Wild Draw Four.

## Rules

- **Matching:** play a card that matches the current colour, number or symbol, or any wild.
  Wild Draw Four can be played at any time.
- **Drawing:** draw one card. If it's playable you may play it straight away or keep it; otherwise
  the turn passes.
- **Skip / Reverse:** as usual. With two players a Reverse acts like a Skip.
- **Rotate:** every hand passes to the next player in the current direction of play.
- **Swap:** the player who played it must pick another player and trade whole hands with them.
- **Going out:** the player who plays their last card wins at once. If that card is a Rotate,
  Swap, wild or draw card, its effect is skipped.
- **One card left:** nobody has to call "Uno!". Every player sees an animation when someone is down
  to one card.
- The first card turned up is always a number card.

### House rules

- **Stacking:** answer a draw card with another to pass the growing total on. +2 on +2, +4 on +4
  and +4 on a +2 are allowed, but never +2 on a +4. The first player who can't (or won't) add to
  the stack draws all of it and loses their turn. If they hold nothing that could be stacked, the
  server picks it up for them after a short pause (leaving a moment for jump-ins).
- **Jump-in:** anyone may play a card identical to the top card (same colour and symbol; a wild on
  a wild of the same kind) out of turn. Play carries on from the player who jumped in. Jumping in
  with a draw card adds to the stack; jumping in with a wild means the jumper picks the colour.
  You can't jump in on your own card, and nobody can jump in while a colour or swap target is
  being chosen.

## Turn timer and idle players

- Each turn lasts 30 seconds. When the timer runs out the server plays the turn for the player:
  - normally it draws one card (a playable drawn card is kept, not played) and passes;
  - facing a draw stack, it takes the whole stack;
  - choosing a colour or a swap target, it picks at random;
  - having already drawn a playable card, it keeps the card and passes.
- A turn the server had to take entirely (drawing a card or taking a stack) is a **strike**.
  After 5 strikes in a row the player is removed from the table. Any move the player makes
  themselves resets the count. Stack pickups the server makes because the player had no choice
  don't count either way.

## Joining and leaving

- Players join by entering a name and picking an avatar. A random token stored on the phone lets
  them reconnect to their seat after a refresh, a lost connection or a locked screen.
- **Before a game:** a game starts 5 seconds after a second player sits down.
- **Mid-game:** a newcomer is dealt 7 cards and seated so they play after everyone already in the
  round. A player who leaves and returns in the same round gets their old hand back.
- **Table full:** visitors past the 8th seat watch, and are seated when a seat opens.
- **Leaving:** the leaver's hand is set aside for the rest of the round. If they were facing a draw
  stack they take it with them. If fewer than two players remain, the round is abandoned.
- **Between games:** the winner is celebrated for 8 seconds, then seats are shuffled and a new game
  is dealt.

## Scoring

A session win count per player (crowns next to each name). It lives in memory, so it resets when
the server restarts or is redeployed, which also ends any game in progress.

## Experience

- Portrait-first phone layout: opponents along the top in turn order, piles in the middle, a
  swipeable hand at the bottom.
- Classic red/yellow/green/blue cards with oval centres, drawn as our own SVG. Each colour also has
  a symbol (▲ red, ● yellow, ■ green, ◆ blue) for colour-blind players.
- Animations: cards fly between hands and piles, hands slide around on Rotate and Swap, stamps for
  Skip, a spinning direction ring, colour splashes, a "last card" alert, jump-in flashes and
  confetti for the winner.
- Sound effects (with a mute button) and emoji reactions. The screen is kept awake during play.
- No bots, no table PIN: anyone with the link can sit down.

## Technology

- TypeScript end to end. The card rules are shared between server and browser.
- Server: Node 24, Fastify (static files and health check) and Socket.IO (game messages). The server
  is authoritative: it holds all state in memory and sends each phone only its own hand.
- Client: React 19 with Motion for animation and canvas-confetti for celebrations.
- Deployment: a Docker image built by Portainer from this Git repository, published on
  `127.0.0.1:3000` for a cloudflared tunnel running on the host.
