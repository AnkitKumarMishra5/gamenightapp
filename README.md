# 🎭 Game Night

*by [Ankit Kumar Mishra](https://ankitkumarmishra.is-a.dev)*

**Your crew, your rules. One room code away.**

Real-time party games in a browser tab. Someone creates a room, everyone else types the
five-letter code, and you play on your own phones. No download, no account, no timers.

---

## A look at it

<p align="center">
  <img src="docs/screens/shot-1.jpg" width="900" alt="Game Night">
</p>

<p align="center">
  <img src="docs/screens/shot-2.jpg" width="900" alt="Game Night">
</p>

<p align="center">
  <img src="docs/screens/shot-3.jpg" width="900" alt="Game Night">
</p>

<p align="center">
  <img src="docs/screens/shot-4.jpg" width="900" alt="Game Night">
</p>

---

## Get started in easy steps

You need a phone or a laptop and at least one friend. Nothing to install, no sign-up.

1. **Open it.** [gamenightapp.onrender.com](https://gamenightapp.onrender.com/) on any browser. It is free and it is hosted, so this is the whole install step.
2. **One of you makes the room.** Tap *Create a room* and pick a game. You get a five-letter code.
3. **Everyone else joins.** Same link, type the code, pick a name. Works on any phone on any network, you do not have to be in the same room.
4. **Read the rules on the screen.** Every game has a *How to play* button. It takes about thirty seconds.
5. **The room owner starts.** Whoever created the room controls the round: starting, calling the vote, spending a hint, handing the chair to someone else.
6. **Play on your own phone.** Your secret word, your cards and your role are yours alone. Nobody else's device shows them.
7. **Nobody is on a clock.** Rounds end when the table is ready, not when a timer runs out.
8. **Somebody dropped out?** They can rejoin with the same code and pick up where they were. If the owner leaves, the chair passes automatically.
9. **Play again.** Same room, same crew, new round. Scores and titles carry across the night.
10. **Add it to your home screen.** It installs like an app and remembers your name.

It is free, and the app never asks who you are.

---

## The games

### 🕵️ Blend In (5 to 16 players)

Everyone gets a secret word. Almost everyone: a few get a slightly different one, and one
may get nothing at all. Take turns giving a one-word clue, argue about who sounded off,
vote somebody out. Say too much and you hand it to the outsiders; say too little and you
look like one.

The AI deals a fresh word pair every game at easy, medium, hard or ultra difficulty, from
Coffee and Tea down to Ocean and Sea. Roles scale with the table, and the room owner starts
the vote when the talking is done, so nothing is on a clock.

### 🏝️ Island Rules (2 to 16 players)

*"I'm going to an island and I'm bringing a Heart and a Window."* There is a rule behind
what the boat accepts. Ask whether your item can come aboard, watch which ones get in, and
work out the rule before anyone else. State it in your own words and an AI judge decides
whether you have it, however you phrase it. Three wrong guesses and you sit the round out.

Stuck? The table earns one hint per round, spent by the room owner once everyone agrees.
An audit button lets the table make the AI judge re-read every ruling if something smells
off, and the room owner can hand the gamemaster chair to any player.

### 🕯️ Silent Order (2 to 8 players)

One co-operative deck, one shared life (clear a level, earn another), no talking. Each level deals everyone cards from 1 to
100 and the table must play them in ascending order on nothing but nerve. Play too early
and everything lower burns. A shared 3D card table deals every round with a riffle shuffle.

### 🃏 Swap or Stay (3 to 10 players)

Everyone holds one card. On your turn, keep it or force the player to your left to trade.
Lowest card at the end goes out. A King blocks the swap; a Jester sends it onward. Read
the table, not the deck.

### 🌙 Sleepless (4 to 16 players)

The village sleeps, somebody does not. Night falls, roles act in order, morning comes with
a body and an argument. Vote, defend, get it wrong. The classic, run by a server that never
leaks a role.

---

## Run it locally

```bash
npm install
npm start          # http://localhost:3456
```

That is the whole setup. Island Rules' AI gamemaster needs a key; without one the room
owner runs the round themselves and can draw from a bank of 60 built-in patterns.

```bash
cp .env.example .env      # then add OPENAI_API_KEY=sk-...
```

Play against bots while you build:

```bash
npm run bots -- ABCDE 4   # four bots join room ABCDE and play on their own
```

---

## Tech stack

Node 18+, Express and Socket.IO on the server. Vanilla ES modules on the client, no
framework and no build step, so what you edit is what runs. The server is authoritative:
every client receives a snapshot personalised to them, so your word is in your payload and
nobody else's is. Rooms live in memory and vanish when the last player leaves.

```
server/
  index.js              socket protocol and HTTP routes, wiring only
  lib/openai.js         generic LLM client, knows nothing about any game
  lib/util.js           ids, room codes, fuzzy word matching
  lib/quips.js          the app's sense of humour
  core/rooms.js         room registry, host transfer, snapshots
  core/scores.js        points, titles, per-room leaderboard
  core/analytics.js     usage log and the metrics derived from it
  core/dashboard.js     the owner's dashboard, one self-contained page
  games/blendin/        engine.js, wordPairs.js
  games/island/         engine.js, patterns.js, ai.js  (the only AI in the app)
  games/silentorder/    engine.js
  games/swaporstay/     engine.js
  games/sleepless/      engine.js
public/
  index.html            shell, SEO tags, structured data
  css/style.css         one stylesheet
  js/main.js            socket client, landing page, lobby, PWA install
  js/core/              DOM toolkit, confetti, sound effects, music, backdrop, rules modal
  js/games/registry.js  the game list; register a new game here
  js/games/<game>/      that game's screens and rules copy
  js/core/cards.js      the shared 3D card table: shuffle, deal, peek, throw
  sw.js                 service worker, network-first for code
tests/e2e.mjs           570+ checks against a real server with real socket clients
tests/games/            one self-contained suite per card game
tools/                  brand assets, backdrop pipeline, bots, link-preview checker
source-assets/          full-resolution originals, deliberately outside public/
```

### Adding a game

1. `server/games/<name>/engine.js` exporting `snapshot(room, playerId)`, your action
  handlers, `removePlayerFromGame` and `onConnectivityChange`.
2. `public/js/games/<name>/index.js` and `rules.js` for the screens and the how-to-play.
3. Register it in `public/js/games/registry.js` and wire its events in `server/index.js`.

Nothing else in the app needs to know it exists.

---

## Tests

```bash
npm test              # 220 checks, spawns a real server, no API key needed
npm run test:ai       # 55 checks against the live OpenAI API, needs a key
```

The suite drives real `socket.io-client` connections through full games: wins and losses on
both sides, ties and runoffs, players leaving mid-vote and mid-guess, host transfer,
rejoining, malformed payloads, scoring, the guess limit, hints, and the dashboard. It
writes to a temporary directory, so running it never touches your real usage log.

---

## Privacy and legal

A Privacy and Terms panel lives in the footer and in **ℹ️ About**. Standard analytics are
collected (device, browser, visit, activity) and used only to run and improve the app.
IP addresses are never stored, only hashed. Nothing typed inside a game is recorded. There
are no cookies, no ad networks and no third-party trackers. In Island Rules' AI mode the
items you type go to OpenAI to be judged, with no name, room or identifier attached.

Every socket is capped at 120 events per 10 seconds. Intended for players 13 and over.

---

## Live app

https://gamenightapp.onrender.com/

---

## Author

**Ankit Kumar Mishra**. Designed and built Game Night, end to end.

[Portfolio](https://ankitkumarmishra.is-a.dev) ·
[LinkedIn](https://www.linkedin.com/in/ankitkumarmishra/) ·
[GitHub](https://github.com/AnkitKumarMishra5)

---

## License

**Proprietary. © 2026 Ankit Kumar Mishra. All rights reserved.** See [LICENSE](LICENSE).

You may read this code and run it locally to evaluate it. You may not copy, host, deploy,
adapt or commercialise it, or use the Game Night name, logo or the author's likeness,
without written permission. Publishing the source here is not a licence to reuse it, but
ask and permission is often given for non-commercial and educational use.
