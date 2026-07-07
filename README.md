# Crypto Debate Arena

Adversarial AI research benchmark on prediction markets. AI agents autonomously research crypto questions using real-time data, debate opposing sides, and are judged by a Byzantine consensus panel. The system evolves its research strategies across generations.

## Quickstart (offline, no keys, ~60 seconds)

```bash
npm install
npm run demo
```

That runs the full pipeline on simulated data — debates, judging, strategy
evolution, and the optimization report — in under a second of compute, and
looks like this:

```
┌────────┬────────┬────────┬─────────────┬─────────────┬───────────┬──────────────────────────────┐
│ Gen    │ Align* │ RQI    │ Claims/Side │ SrcDiv/Side │ JudgeConf │ Strategy Shift               │
├────────┼────────┼────────┼─────────────┼─────────────┼───────────┼──────────────────────────────┤
│ 1 (m)  │ 0.585  │ 0.555  │ 3.00        │ 3.00        │ 0.600     │ baseline                     │
│ 2 (m)  │ 0.585  │ 0.700  │ 4.00        │ 4.00        │ 0.600     │ + lesson: Prioritize smart…  │
│ 3 (m)  │ 0.585  │ 0.845  │ 5.00        │ 5.00        │ 0.600     │ + lesson: Increase source…   │
└────────┴────────┴────────┴─────────────┴─────────────┴───────────┴──────────────────────────────┘
Optimization Delta:   RQI: +0.290   Alignment proxy: +0.000
```

To preview what a **live** run's report looks like without spending anything:
`RESULTS_DIR=results/samples npm run arena -- report`

### How to read the numbers

- **Align\*** — calibration against the live market-implied probability (winner YES → score = market price; winner NO → `1 − price`). Tracks agreement with market consensus.
- **RQI** — research quality index: `0.45·claimDepth + 0.35·sourceDiversity + 0.20·judgeConfidence`. Tracks research process quality even before markets settle.
- `(m)` marks simulated (mock) generations; the report header carries a MOCK/LIVE badge and the run id.

## Going live

Live runs need three CLIs. Set them up in this order, then verify with `doctor`:

1. **surf** (market + crypto data): `curl -fsSL https://downloads.asksurf.ai/cli/releases/install.sh | sh`, then `surf auth --api-key <key>` (key from https://agents.asksurf.ai). **Live runs spend surf credits** — roughly 15–20 surf calls per market debated (one fetch plus 6–8 research calls per side).
2. **claude** CLI, installed and authenticated (default agent runtime).
3. **cursor-agent** (optional alternative runtime: `--agent-runtime cursor`).

```bash
npm run arena -- doctor    # checks node, surf (+auth), and the agent CLI
```

A live generation on 3 markets takes ~4–8 minutes; progress lines print
throughout, and every run records per-debate timings.

> **Runtime security note:** the claude runtime runs debaters with bash
> allowlisted to the surf CLI only (`--allowedTools "Bash(surf:*)"` with
> enforced permission mode). The cursor runtime uses `--force`, which grants
> unrestricted shell to a model that reads untrusted market/web content — use
> it only with trusted inputs on an isolated machine.

## Usage

The CLI has subcommands (`run` is the default; a bare invocation prints help):

```bash
# Offline mock evolution (no CLIs needed)
npm run arena -- run --mock -g 3

# Live: one generation on 3 markets, verbose
npm run arena -- run -m 3 -v

# Live: 5 generations of evolution
npm run arena -- run -m 3 -g 5 -v

# Live: curated showcase market set (validated, auto-topped-up if expired)
npm run arena -- run --showcase -m 3 -g 4

# Debate a specific Polymarket question
npm run arena -- run --condition-id 0x1234...

# Reports and housekeeping
npm run arena -- report        # Align*/RQI trend for the latest run
npm run arena -- history       # current playbook + generation history
npm run arena -- runs          # list saved runs (mode, gens, duration)
npm run arena -- prune --keep 5  # delete result files from older runs
```

Models and timeouts are configured in `src/config.ts`; the high-churn knobs
have env overrides: `DEBATER_MODEL`, `JUDGE_MODEL`, `ANALYST_MODEL`,
`AGENT_TIMEOUT_MS`.

### Demo scripts

```bash
npm run demo             # guaranteed 2-minute stage flow (mock, offline, repeatable)
npm run showcase:live    # live evidence run (markets=3, generations=4) + report
npm run showcase:report  # re-print the report for the latest run
```

The fast flow is idempotent: mock runs always start from a fresh playbook
(isolated from live strategy state), so the on-stage optimization delta is
identical on every rehearsal. See
[docs/showcase-presentation.md](docs/showcase-presentation.md) for the stage
script.

## System Design

The system is organized as a multi-agent research pipeline:

1. **Market selection**: fetches active prediction markets from Polymarket/Kalshi (showcase IDs are validated: expired or extreme-priced markets are replaced from live crypto discovery).
2. **Adversarial debaters**: YES and NO agents independently gather evidence with Surf tools.
3. **Byzantine judge panel**: three judges evaluate argument quality and vote. A judge whose vote can't be parsed is re-asked once, then abstains — abstentions are never converted into fabricated votes, and a debate needs a majority of valid votes to count.
4. **Consensus + scoring**: votes are aggregated into a verdict (ties break by total confidence) and scored against market probability.
5. **Analyst mutation**: an analyst updates the strategy playbook for the next generation using the full score history. Mutations that regress the score are rolled back (accept/reject ratchet), and analyst output is schema-validated before persisting.
6. **Persistence**: results and strategy state are written for replay and trend analysis. A failed debate is skipped, a failed generation stops evolution gracefully with partial results intact.

During an evolution run the market panel is frozen after the first generation
so per-generation scores are measured against the same questions and prices.

Core persisted artifacts:

- `results/gen-*.json`: generation-level outputs (debates, votes, score, timings, metadata)
- `results/samples/`: a committed real live-run result for previewing the report
- `strategies/playbook.json`: evolving strategy state (`lessons`, `toolPriority`, `avoidPatterns`)
- `strategies/playbook-history.jsonl`: append-only trail of every mutation (with reverted markers)

## Tests

```bash
# Offline suite (default; no network, no CLIs, runs in CI)
npm test

# Typecheck
npm run typecheck

# Live integration tests (need authenticated surf CLI; spend API credits)
npm run test:live

# Live end-to-end debate (needs authenticated surf + agent CLI, several minutes)
npm run test:e2e
```

CI (GitHub Actions) runs the typecheck and the offline suite on every push/PR.
