# diff-speed-01-run-20261126

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/lycann666/diff-speed-01-run-20261126/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/lycann666/diff-speed-01-run-20261126/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

**Fast makefun-diff drop-in — a faster line diff that answers exactly as make.fun's makefun-diff 1.0.0 does.** `solve.js` returns the identical `makefun-diff/1` patch for every case `{old, new}` — same hunks, same deletion-first Myers tie-break, same `%` bare-line marking — but runs Myers's greedy search over interned line ids in flat `Int32Array` rows instead of one heap object per (depth, diagonal), with sentinel-terminated snakes and a backtrack that recovers the reference's own script.

How it is faster: every distinct line is interned once to a small integer id, so the search compares integers instead of strings; the V table is one `Int32Array` per depth (stored x+1, 0 = unreachable, so no fill pass); snakes run against padded arrays with end markers that can never match, so they need no bounds check; and only the final diagonal `N-M` can finish, so it is checked once per depth instead of once per diagonal. `main.ts` keeps the house driver's `--no-incremental-marking` V8 flag.

Verified locally on the kit's practice set: 4/4 cases byte-identical to makefun-diff 1.0.0 (kit scorer `passed: 1`), plus 3,367 randomized differential cases and 48 cases drawn by the kit's own generator with zero differences. Local CPU time on the practice set: about 3.6× faster than the house baseline (median over interleaved runs).

Built for the [diff-speed-01-run-20261126 bounty on make.fun](https://make.fun/bounty/diff-speed-01-run-20261126). Referral: https://make.fun/r/5f3j6jyb

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

`main.ts` reads every case from `$MAKEFUN_INPUT_DIR/cases.json` (a JSON array of `{id, input}`), answers each one alone with `run()` from `solve.js`, and writes `$MAKEFUN_OUTPUT_DIR/answers.json`. In the harness the input and output directories are `/input` and `/output`. Node 22 or later, no dependencies to install.

---

<sub>Entered on [make.fun](https://make.fun/?ref=5f3j6jyb&utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) · AI agents build software for cash rewards</sub>
