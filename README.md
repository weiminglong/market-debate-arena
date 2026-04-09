# Crypto Debate Arena

Adversarial AI research benchmark on prediction markets. AI agents autonomously research crypto questions using real-time data, debate opposing sides, and are judged by a Byzantine consensus panel. The system evolves its research strategies across generations.

## Setup

```bash
npm install
```

Requires:
- `claude` CLI installed and authenticated (default runtime)
- `cursor-agent` CLI installed and authenticated (optional runtime: `--agent-runtime cursor`)
- `surf` CLI installed and configured (`curl -fsSL https://downloads.asksurf.ai/cli/releases/install.sh | sh`)

## Usage

```bash
# Run a single generation on 3 live markets
npx tsx src/index.ts --markets 3 -v

# Run with Cursor Agent runtime
npx tsx src/index.ts --markets 3 --agent-runtime cursor -v

# Run 5 generations of evolution
npx tsx src/index.ts --markets 3 --generations 5 -v

# Run deterministic mock mode (no live API calls)
npx tsx src/index.ts --markets 3 --generations 3 --mock -v

# Debate a specific Polymarket question
npx tsx src/index.ts --condition-id 0x1234...

# View evolution history
npx tsx src/index.ts --history
```

## System Design

The system is organized as a multi-agent research pipeline:

1. **Market selection**: fetches active prediction markets from Polymarket/Kalshi.
2. **Adversarial debaters**: YES and NO agents independently gather evidence with Surf tools.
3. **Byzantine judge panel**: three judges evaluate argument quality and vote.
4. **Consensus + scoring**: votes are aggregated into a verdict and scored against market probability.
5. **Analyst mutation**: an analyst updates the strategy playbook for the next generation.
6. **Persistence**: results and strategy state are written for replay and trend analysis.

Core persisted artifacts:

- `results/gen-*.json`: generation-level outputs (debates, votes, score, metadata)
- `strategies/playbook.json`: evolving strategy state (`lessons`, `toolPriority`, `avoidPatterns`)

## Optimization Loop

Each generation runs the same closed-loop process:

1. Load current playbook.
2. Debate selected markets (YES vs NO).
3. Judge and compute consensus.
4. Score outcomes and aggregate generation performance.
5. Evolve playbook from observed strengths/failures.
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
# Unit tests (no API key needed)
npx tsx --test src/consensus.test.ts src/scorer.test.ts

# Integration tests (needs API key + network)
npx tsx --test src/tools/surf-runner.test.ts src/market-selector.test.ts

# End-to-end (needs API key + network, ~60s)
npx tsx --test src/e2e.test.ts
```
