# Crypto Debate Arena - Showcase Presentation

## 1) Opening Pitch (20s)

We built an adversarial AI research benchmark for crypto prediction markets.

Two autonomous agents debate opposite sides of the same market question, a three-judge Byzantine panel votes on the stronger argument, and the system scores itself against live market probability.

Then an analyst agent updates the strategy playbook so the next generation debates better.

Core line:

> "AI agents that research, argue, judge, and improve themselves on live market questions."

---

## 2) Problem and Why It Matters (20s)

- Most AI demos show one model answering one prompt.
- Real research workflows require disagreement, evidence quality checks, and calibration.
- Prediction markets provide a practical, always-on ground truth signal (market-implied probability).

So instead of "did the model sound smart?", we evaluate:

- Did arguments use relevant, recent, multi-source evidence?
- Did independent judges agree?
- Did the final verdict align with market consensus?

---

## 3) What We Built (30s)

### Agent Roles

- **Debater YES**: builds the strongest YES case with live Surf data.
- **Debater NO**: builds the strongest NO case with live Surf data.
- **3 Judge Agents**: vote independently on evidence quality and reasoning.
- **Analyst Agent**: updates strategy playbook between generations.

### Data Sources via Surf

- Market price and technical indicators
- On-chain indicators
- Social signals
- News feed
- Smart money on Polymarket
- DeFi metrics
- Fear and greed index
- Prediction market search

### Output

- Winner and confidence per market
- Aggregate score per generation
- Persisted results JSON for replay
- Evolving `strategies/playbook.json`

---

## 4) Architecture Snapshot (20s)

1. Select markets (live or curated showcase set)
2. Run YES/NO debaters
3. Judges vote and compute consensus
4. Score winner against market probability
5. Save results and (optionally) evolve strategy

Key implementation points:

- Runtime switch: `claude` or `cursor-agent`
- Showcase mode for stable demos: `--showcase`
- Parser hardening for mixed prose + JSON model outputs
- Serialized Cursor calls to avoid local config race conditions

---

## 5) 2-Minute Demo Plan

## 5.1 Preflight (before going on stage)

```bash
surf auth
npx tsc --noEmit
```

## 5.2 Timestamped Script (120 seconds)

### 0:00-0:20 Hook

Say:

> "We built a self-improving AI research arena: two agents debate, three judges vote, and we score against live prediction markets."

### 0:20-0:40 What is unique

Say:

> "This is not one model answering one prompt. It is adversarial research plus Byzantine consensus with measurable calibration."

### 0:40-1:40 Run one curated live debate

```bash
npx tsx src/index.ts --showcase --agent-runtime cursor --markets 1
```

Talk track:

- "Showcase mode guarantees a stable market set."
- "Runtime is pluggable (`cursor-agent` or `claude`)."
- "Winner is judged by 3 independent judges; score is market alignment."

### 1:40-2:00 Close with learning loop

```bash
npx tsx src/index.ts --history
```

Talk track:

- "The playbook captures what the system learned and what to avoid."
- "This is auditable self-improvement, not a black-box answer."

---

## 6) What Judges Usually Ask (Suggested Answers)

### Q: How is this different from just prompting one model?

A: We explicitly model disagreement, adjudication, and measurable calibration against market consensus. The benchmark is multi-agent and auditable.

### Q: Why use market probability as ground truth?

A: It is immediate, always available, and information-aggregated. We can run this benchmark on live markets any time without waiting weeks for final resolution.

### Q: How do you prevent hallucinated "evidence"?

A: Debaters are instructed to ground claims in Surf command outputs, judges penalize weak relevance/coherence, and we persist structured claims and vote reasoning.

### Q: Is it robust in a live environment?

A: Yes. We added a curated showcase mode, runtime switching, hardened JSON extraction, and serialized Cursor invocation to avoid concurrency issues.

---

## 7) Backup Plan (if live APIs degrade or timer is strict)

If network or external services become unstable:

```bash
npx tsx src/index.ts --showcase --agent-runtime cursor --mock --markets 1
```

Message:

- "This fallback preserves the full multi-agent pipeline while using simulated data."
- "The same orchestration, judging, scoring, and persistence logic still runs end-to-end."

---

## 8) Showcase Narrative (1-sentence versions)

- **Technical:** "A multi-agent benchmark where adversarial debate plus Byzantine judging improves strategy over generations."
- **Product:** "An always-on AI research arena for market questions with measurable calibration."
- **Hackathon:** "We turned AI research from one-shot answers into a competitive, self-improving system."

---

## 9) 4-Slide Outline (fits 2 minutes)

1. Problem + one-line solution
2. Multi-agent architecture (Debaters, Judges, Analyst)
3. Live run command + one result screenshot
4. Why it matters + next steps

---

## 10) Roadmap After Hackathon

- Add side-by-side runtime benchmark (`claude` vs `cursor-agent`) on identical markets
- Add per-tool attribution metrics (which tools correlated with winning arguments)
- Add replay UI from saved results
- Add resolved-outcome backtesting for long-horizon calibration
- Add CI benchmark runs on fixed market snapshots

---

## 11) 2-Minute Presenter Checklist

- [ ] Confirm `surf auth` is active
- [ ] Use `--showcase --agent-runtime cursor --markets 1`
- [ ] Keep fallback command (`--mock --markets 1`) ready
- [ ] Keep one saved result screenshot as hard backup
- [ ] End with `--history` if time remains

