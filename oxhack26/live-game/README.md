# Live game template

A host-driven live quiz on [PartyKit](https://partykit.io): one screen runs the
game, everyone else answers on their own phone, and scores update in real time.

Distilled from a hackathon build (a code-quiz battle). The database, analytics
and effects are gone; the room logic is rewritten so the server is the single
source of truth.

**Stack:** PartyKit (WebSockets, one room per code) · Next.js (App Router) · React 19 · TypeScript · Tailwind CSS 3

## Run it

```bash
pnpm install
pnpm dev            # Next on :3000 and PartyKit on :1999, together
```

Open http://localhost:3000, click **Host a game**, then open the same site in
other tabs (or phones on your network), enter the room code and a name, and join.

| Script              | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `pnpm dev`          | Web and party server together                   |
| `pnpm dev:web`      | Next only                                       |
| `pnpm dev:party`    | PartyKit only                                   |
| `pnpm build`        | Production build of the web app                 |
| `pnpm deploy:party` | Deploy the game server to PartyKit              |
| `pnpm lint`         | ESLint                                          |
| `pnpm typecheck`    | `tsc --noEmit`                                  |

To deploy, run `pnpm deploy:party`, then set `NEXT_PUBLIC_PARTYKIT_HOST` to the
host it prints and deploy the web app anywhere that runs Next.

## How a game flows

```
lobby ──start──► question ──all answered / timer / reveal──► reveal ──next──► question … ──► ended ──restart──► lobby
```

| File                       | What                                                                  |
| -------------------------- | --------------------------------------------------------------------- |
| `party/index.ts`           | The room: phases, scoring, host rules. One instance per room code    |
| `src/shared/protocol.ts`   | Message types and the input parser, imported by server and client     |
| `src/shared/questions.ts`  | The questions. Edit this to make your own game                        |
| `src/components/game.tsx`  | Socket, reconnect, countdown; switches on the phase                   |
| `src/components/*-view.tsx`| One screen per phase                                                  |

Decisions worth keeping when you adapt it:

- **The client sends intents, the server sends state.** A client says “I answered 2”; the server decides whether that counts, who gets points, and what everyone sees. Nobody can award themselves points.
- **Role comes from the connection, not the message.** The first connection to an empty room is the host; the server checks the sender, so a player cannot send `start` by pretending to be the host.
- **The answer never leaves the server early.** While a question is open, the state has no `answer` and no `explanation`; they arrive with the reveal. (Checked in a scripted playtest.)
- **Each client gets its own snapshot.** `you` carries your own pick and points; other players only show whether they answered.
- **Identity survives reloads.** The client id lives in `sessionStorage`, so a reload keeps your seat and score, and a second tab is a second player.

## Where to change things

| Want to                          | Edit                                                                 |
| -------------------------------- | -------------------------------------------------------------------- |
| Change questions or timings      | `src/shared/questions.ts`                                            |
| Change scoring                   | `POINTS_BASE` / `POINTS_SPEED` and `closeQuestion` in `party/index.ts` |
| Add a message or phase           | `protocol.ts`, then handle it in `party/index.ts` and add a view      |
| Free-text answers                | Change `answer` to a string in the protocol and compare in `closeQuestion` |
| Restyle                          | CSS variables in `src/app/globals.css`                               |

## Things to know

- **Room state is in memory.** If every connection drops and PartyKit evicts the room, the game is gone. For anything longer than an event, persist to `room.storage` in `broadcast()`.
- **First to connect hosts.** Anyone who opens a fresh code first becomes its host. Fine for a hackathon; add a host secret (generated on “Host a game”, checked on connect) if rooms are public.
- **Names are not unique.** Two players can both be “Sam”; the id is what tells them apart.
- **The countdown is cosmetic on the client.** The server owns the real timer; the client counts down from the `remainingMs` it was sent, so a slow device only sees a slightly different bar.
- **Tested with a host and two players.** The server was played end to end with scripted sockets (early reveal, reconnect, restart, bad input), and the browser screens were clicked through from lobby to reveal. The final results screen and “Play again” were not clicked through.
