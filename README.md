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
# Run a single debate on 3 markets
npx tsx src/index.ts --markets 3 -v

# Run with Cursor Agent runtime (for showcase/demo)
npx tsx src/index.ts --markets 3 --agent-runtime cursor -v

# Run curated showcase markets (stable demo path)
npx tsx src/index.ts --showcase --agent-runtime cursor -v

# Run the 2-minute showcase script (stage-safe fast flow)
bash scripts/showcase-2min.sh

# Pre-run live generations for optimization evidence
bash scripts/showcase-2min.sh --live

# Show automated optimization report from latest run
npx tsx src/index.ts --showcase-report

# Run 5 generations of evolution
npx tsx src/index.ts --markets 3 --generations 5 -v

# Debate a specific Polymarket question
npx tsx src/index.ts --condition-id 0x1234...

# View evolution history
npx tsx src/index.ts --history
```

The showcase flow emphasizes automated optimization, not only unresolved market
outcomes. It reports both:

- **Align\***: alignment proxy versus live market-implied probability
- **RQI**: research quality index (claim depth, source diversity, judge confidence)

## How It Works

1. Fetches active prediction markets from Polymarket/Kalshi
2. Assigns YES and NO debater agents (configurable runtime: `claude` or `cursor-agent`)
3. Each agent autonomously researches using 10 crypto data tools (prices, on-chain, social, news, DeFi, prediction markets)
4. A panel of 3 judge agents evaluates both sides via Byzantine consensus
5. Results scored against market price as ground truth
6. An analyst agent evolves the strategy playbook between generations

## Tests

```bash
# Unit tests (no API key needed)
npx tsx --test src/consensus.test.ts src/scorer.test.ts

# Integration tests (needs API key + network)
npx tsx --test src/tools/surf-runner.test.ts src/market-selector.test.ts

# End-to-end (needs API key + network, ~60s)
npx tsx --test src/e2e.test.ts
```
