# Crypto Debate Arena

Adversarial AI research benchmark on prediction markets. AI agents autonomously research crypto questions using real-time data, debate opposing sides, and are judged by a Byzantine consensus panel. The system evolves its research strategies across generations.

## Setup

```bash
npm install
```

Requires (live mode only — mock mode is fully offline):
- `claude` CLI installed and authenticated (default runtime)
- `cursor-agent` CLI installed and authenticated (optional runtime: `--agent-runtime cursor`)
- `surf` CLI installed and configured (`curl -fsSL https://downloads.asksurf.ai/cli/releases/install.sh | sh`)

> **Runtime security note:** the claude runtime runs debaters with bash
> allowlisted to the surf CLI only (`--allowedTools "Bash(surf:*)"` with
> enforced permission mode). The cursor runtime uses `--force`, which grants
> unrestricted shell to a model that reads untrusted market/web content — use
> it only with trusted inputs on an isolated machine.

## Usage

```bash
# Run a single generation on 3 live markets
npx tsx src/index.ts --markets 3 -v

# Run with Cursor Agent runtime (or set AGENT_RUNTIME=cursor)
npx tsx src/index.ts --markets 3 --agent-runtime cursor -v

# Run 5 generations of evolution
npx tsx src/index.ts --markets 3 --generations 5 -v

# Run deterministic mock mode (no live API calls, no CLIs needed)
npx tsx src/index.ts --markets 3 --generations 3 --mock -v

# Debate a specific Polymarket question
npx tsx src/index.ts --condition-id 0x1234...

# Curated showcase market set (validated live, auto-topped-up if expired)
npx tsx src/index.ts --showcase --markets 3 --generations 4

# View evolution history / the optimization report for the latest run
npx tsx src/index.ts --history
npx tsx src/index.ts --showcase-report
```

### Showcase / demo

```bash
npm run showcase:2min    # guaranteed 2-minute stage flow (mock, offline, repeatable)
npm run showcase:live    # live evidence run (markets=3, generations=4) + report
npm run showcase:report  # re-print the optimization report for the latest run
```

The fast flow uses simulated data and is idempotent: mock runs always start
from a fresh playbook (isolated from live strategy state via a temp
`PLAYBOOK_PATH`), so the on-stage optimization delta is identical on every
rehearsal. The report header shows the run id and a MOCK/LIVE badge, and mock
generations are marked `(m)`.

## System Design

The system is organized as a multi-agent research pipeline:

1. **Market selection**: fetches active prediction markets from Polymarket/Kalshi (showcase IDs are validated: expired or extreme-priced markets are replaced from live discovery).
2. **Adversarial debaters**: YES and NO agents independently gather evidence with Surf tools.
3. **Byzantine judge panel**: three judges evaluate argument quality and vote. A judge whose vote can't be parsed is re-asked once, then abstains — abstentions are never converted into fabricated votes, and a debate needs ≥2 valid votes to count.
4. **Consensus + scoring**: votes are aggregated into a verdict (ties break by total confidence) and scored against market probability.
5. **Analyst mutation**: an analyst updates the strategy playbook for the next generation using the full score history. Mutations that regress the score are rolled back (accept/reject ratchet), and analyst output is schema-validated before persisting.
6. **Persistence**: results and strategy state are written for replay and trend analysis. A failed debate is skipped, a failed generation stops evolution gracefully with partial results intact.

During an evolution run the market panel is frozen after the first generation
so per-generation scores are measured against the same questions and prices.

Core persisted artifacts:

- `results/gen-*.json`: generation-level outputs (debates, votes, score, metadata)
- `strategies/playbook.json`: evolving strategy state (`lessons`, `toolPriority`, `avoidPatterns`)
- `strategies/playbook-history.jsonl`: append-only trail of every mutation (with reverted markers)

## Optimization Loop

Each generation runs the same closed-loop process:

1. Load current playbook.
2. Debate the frozen market panel (YES vs NO).
3. Judge and compute consensus.
4. Score outcomes and aggregate generation performance.
5. Evolve playbook from observed strengths/failures and score history; revert if the score regressed.
6. Repeat for the next generation.

### Metrics

- **Align\*** (alignment proxy): calibration against live market-implied probability.
  - If winner is YES: score = market price.
  - If winner is NO: score = `1 - market price`.
- **RQI** (research quality index): settlement-independent quality signal from:
  - claim depth (claims per side),
  - source diversity (unique sources per side),
  - judge confidence.

RQI weighting (normalized):

`RQI = 0.45 * claimsDepth + 0.35 * sourceDiversity + 0.20 * judgeConfidence`

Why both metrics:

- **Align\*** tracks online calibration to market consensus.
- **RQI** tracks research process quality even when markets have not yet settled.

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
