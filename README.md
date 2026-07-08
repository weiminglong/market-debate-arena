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

The debaters aren't shown the market price and are instructed not to look it up;
the judges then estimate the probability of YES purely from the evidence. So the
panel produces an **independent** `Model P(YES)`, and the trader-facing output
falls out of comparing it to the quote:

- **Edge** = `Model P(YES) − market price` — the signed disagreement. Positive → YES looks underpriced (the market may be too low); negative → overpriced. This is the tradeable signal: where the model thinks the market is wrong, and by how much.
- **Call** — `BUY_YES` / `BUY_NO` / `PASS`. Fires only when `|edge|` clears a threshold (default 0.08, in `src/config.ts`) that absorbs model noise, fees, and slippage. `EV = |edge|` per $1 of the contract when acting. Note: the discrete winner (is YES more likely than not?) and the call (is YES *mispriced*?) can point different ways — a market at 0.34 with a model estimate of 0.49 is "more likely NO" yet still underpriced → `BUY_YES`.
- **Ensembling (`--rounds N`)** — a single panel is noisy (dogfooding saw `Model P` swing ~0.19 run-to-run). With `--rounds N` the debate runs `N` independent times; `Model P` is reported as **mean ± SD**, and the Call only fires when `|edge|` exceeds both the base threshold **and** the estimator noise (default 2 standard errors, `EDGE.noiseSigmas`). This costs `N×` time and credits and is the honest way to tell a real edge from a lucky draw — most single-run edges turn out to be within noise.
- **Align\*** — the market-implied probability of the side the panel picked (winner YES → price; winner NO → `1 − price`). It measures *directional* agreement with the market weighted by the market's own confidence — it rewards siding with a confident market. It is **not** the distance between `Model P(YES)` and the price (that gap is the edge). It remains the objective the evolution loop optimizes.
- **RQI** — research quality index: `0.45·claimDepth + 0.35·sourceDiversity + 0.20·judgeConfidence`. Tracks research process quality even before markets settle.
- `(m)` marks simulated (mock) generations; the report header carries a MOCK/LIVE badge and the run id.

> Edge is a *signal*, not a guarantee. The price blind is enforced three ways —
> the debater prompt, withholding the market-lookup tool, and a code pass that
> strips any market-lookup claim before the judges see it — but not by a hard
> sandbox, so treat blinding as best-effort. Whether the edge is any *good* is
> an empirical question: run `npm run arena -- calibrate` to score past
> predictions against resolved outcomes (see below). Until the sample is large,
> treat a `Call` as "worth a closer look," not an instruction.

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

# Live: ensemble 3 independent panels per debate to measure (and gate on) noise
npm run arena -- run -m 3 --rounds 3 -v

# Debate a specific Polymarket question
npm run arena -- run --condition-id 0x1234...

# Reports and housekeeping
npm run arena -- report        # Align*/RQI trend for the latest run
npm run arena -- calibrate     # score past predictions vs resolved outcomes
npm run arena -- history       # current playbook + generation history
npm run arena -- runs          # list saved runs (mode, gens, duration)
npm run arena -- prune --keep 5  # delete result files from older runs
```

### Calibration — is the edge any good?

An edge is only worth trading if the model is actually well-calibrated, so the
arena keeps score. `calibrate` looks up every past **live** prediction, checks
which markets surf now reports as settled (`closed`/`finalized` with a decisive
price), and grades the model against the outcome:

```bash
npm run arena -- calibrate                # resolve via surf, then score
npm run arena -- calibrate --no-refresh   # offline: use cached resolutions only
```

It reports **Brier score and log-loss for the model vs. the market** (with a
skill score — positive means the model's probabilities beat the market's
price), a **reliability table** (do markets the model calls 70% actually happen
~70% of the time?), and a **trade record** (hit rate and realized P&L of the
actionable calls vs. their expected edge). Resolved outcomes are cached in
`results/resolutions.json` so a settled market is only looked up once. Until
several markets resolve it will honestly say "N pending" — the scores populate
as the markets you debated settle.

Models, timeouts, and the edge threshold are configured in `src/config.ts`; the
high-churn knobs have env overrides: `DEBATER_MODEL`, `JUDGE_MODEL`,
`ANALYST_MODEL`, `AGENT_TIMEOUT_MS`.

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
2. **Adversarial debaters (price-blind)**: YES and NO agents independently gather evidence with Surf tools. They are **not shown the market price**, are instructed not to look it up, the market-lookup tool is withheld from them, and a code pass strips any market-lookup claim before it reaches the judges — so their research can't anchor to the market's own guess (best-effort, not a hard sandbox). The point is an independent read the market may have gotten wrong.
3. **Forecaster judge panel**: three judges estimate P(YES) from the evidence alone (also price-blind). A judge whose estimate can't be parsed is re-asked once, then abstains — abstentions are never fabricated into a directional estimate, and a debate needs a majority of valid votes to count.
4. **Consensus + edge**: the panel mean becomes `Model P(YES)`; the winner follows from it (so verdict and probability never disagree). **Edge = Model P(YES) − market price** yields a `BUY_YES`/`BUY_NO`/`PASS` call with expected value once it clears the threshold. Align\* (directional market-agreement score) is still recorded and drives the evolution objective.
5. **Analyst mutation**: an analyst updates the strategy playbook for the next generation using the full score history. Mutations that regress the score are rolled back (accept/reject ratchet), and analyst output is schema-validated before persisting.
6. **Persistence**: results and strategy state are written for replay and trend analysis. A failed debate is skipped, a failed generation stops evolution gracefully with partial results intact.

During an evolution run the market panel is frozen after the first generation
so per-generation scores are measured against the same questions and prices.

Core persisted artifacts:

- `results/gen-*.json`: generation-level outputs (debates, votes, score, timings, metadata)
- `results/samples/`: a committed real live-run result for previewing the report
- `results/resolutions.json`: cached settled outcomes for calibration scoring
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
