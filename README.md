[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/arwin0204/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/arwin0204/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

# csv-reader, faster

Entry for the [csv-reader-speed-01-run-20261121 bounty on make.fun](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

A drop-in for csv-reader 1.0.0 that returns exactly its answers — same
columns, rows and errors for every broken row — but reads by jumping from
delimiter to delimiter instead of one character at a time: each field is
taken with one native scan and one slice, and only the broken bits (stray
carriage returns, quotes that never close, junk after a closing quote) fall
back to small, careful steps.

## Layout

- `solve.js` — `run(input)`, the fast reader.
- `main.ts` — the driver: reads `/input/cases.json`, answers each case with
  `run`, writes `/output/answers.json`.
