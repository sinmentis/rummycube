# RummyCube

Online multiplayer rummy tiles game (2-4 players), played in the browser with a
nickname and a room code. Hosted at https://game.shunlyu.com.

## Credits

Bootstrapped from [ilov3/rummikub](https://github.com/ilov3/rummikub). Thanks to
the original author. Distributed under the MIT License (see `LICENSE`).

## House rules (inherited, may change)

1. A tile with value "1" can be placed after "13" in a run (but not "2" after "1").
2. After the initial meld, a skipping player draws two tiles instead of one.

## Local development

Requires Node 22+.

```shell
cp .env.example .env   # adjust values if needed
npm install
npm start              # frontend (Vite dev server)
npm run serve          # dev backend server
```

## Tests

```shell
npm test
```
