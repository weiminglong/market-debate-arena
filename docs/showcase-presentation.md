# Crypto Debate Arena - Showcase Presentation

## Full Speaking Script (Use This Verbatim)

### Pre-stage setup (not spoken)

Run once before your slot:

```bash
bash scripts/showcase-2min.sh --live --runtime cursor
```

Keep one terminal tab ready for:

```bash
bash scripts/showcase-2min.sh
```

### On-stage 2-minute script (spoken + actions)

#### 0:00-0:15 - Hook

Say:

> "Most AI demos show one model giving one answer. We built something harder to fake: two AI agents debate opposite sides, three judges vote, and the system improves its own research strategy generation by generation."

#### 0:15-0:30 - Why this matters

Say:

> "For live prediction markets, confidence alone is not enough. We need disagreement, evidence quality checks, and measurable calibration."

#### 0:30-0:35 - Start demo

Action:

```bash
bash scripts/showcase-2min.sh
```

Say while command starts:

> "This is our stage-safe two-minute run: same orchestration pipeline, deterministic timing, and then an optimization report."

#### 0:35-1:20 - Explain pipeline while output streams

Say:

> "Generation one runs YES and NO debaters with Surf-backed evidence.  
> Three independent judges apply Byzantine consensus to pick a winner.  
> Then the analyst mutates the playbook, and generation two reruns with updated strategy."

> "So this is not static prompting. It is an automated research loop: debate, judge, mutate, repeat."

#### 1:20-1:45 - Explain metrics clearly

Say when report table appears:

> "We track two metrics. Align-star is calibration against current market-implied probability. RQI is research quality: claim depth, source diversity, and judge confidence."

> "When markets are unresolved, RQI trend is the primary optimization signal, and Align-star is the online calibration proxy."

#### 1:45-2:00 - Close

Say:

> "In one line: we turned AI research from one-shot answers into a competitive, auditable, self-improving system."

> "This can be used as a benchmark harness for any market question where evidence quality matters."

### 60-second extension (if judges ask follow-ups)

#### Q: "Is this real or mocked?"

Say:

> "On stage we run the fast deterministic path for timing safety. Before presenting, we run the live evidence mode over more markets and generations, and the same report pipeline summarizes real outputs."

#### Q: "What exactly is improving?"

Say:

> "Two layers improve: strategy mutations in the playbook and research quality metrics, especially RQI. That gives a settlement-independent optimization signal even before markets resolve."

#### Q: "Why prediction markets?"

Say:

> "They give continuous, information-aggregated probabilities, so we can evaluate calibration daily instead of waiting weeks for final outcomes."

---

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

Measured runtimes on current setup:

- `--showcase --agent-runtime cursor --markets 1` (live): about **252s**
- `bash scripts/showcase-2min.sh` (fast): about **2s**
- `--showcase-report`: about **1-2s**

Conclusion: for a strict 2-minute slot, use the fast path below on stage.

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

### 0:40-1:20 Run fast end-to-end optimization loop

```bash
bash scripts/showcase-2min.sh
```

Talk track:

- "This runs two generations and prints an optimization report."
- "You can see strategy mutations and research quality changes."
- "Markets may be unresolved, so we report both alignment proxy and research quality index."

### 1:20-1:50 Show real live evidence (pre-run)

Say:

> "Before this presentation, I ran live showcase evolution (`bash scripts/showcase-2min.sh --live`). Here is the saved optimization report and scorecard output."

Tip:

- Use this before going on stage: `bash scripts/showcase-2min.sh --live`
- Keep one screenshot of a recent live scorecard in your slides.
- Keep one `results/gen-*.json` file open in your editor as backup.

### 1:50-2:00 Close

```bash
npx tsx src/index.ts --showcase-report
```

Talk track:

- "This report summarizes automated optimization: better research behavior over generations."
- "The process is auditable: claims, sources, judge confidence, and strategy shifts."

---

## 6) What Judges Usually Ask (Suggested Answers)

### Q: How is this different from just prompting one model?

A: We explicitly model disagreement, adjudication, and measurable calibration against market consensus. The benchmark is multi-agent and auditable.

### Q: Why use market probability as ground truth?

A: It is immediate, always available, and information-aggregated. We can run this benchmark on live markets any time without waiting weeks for final resolution.

### Q: But markets are not settled yet, so what are you actually optimizing?

A: Two layers. First, **Align\*** is an online proxy against current market consensus. Second, we optimize a settlement-independent **RQI** from claim depth, source diversity, and judge confidence. Settlement data is used later for retrospective validation.

### Q: How do you prevent hallucinated "evidence"?

A: Debaters are instructed to ground claims in Surf command outputs, judges penalize weak relevance/coherence, and we persist structured claims and vote reasoning.

### Q: Is it robust in a live environment?

A: Yes. We added a curated showcase mode, runtime switching, hardened JSON extraction, and serialized Cursor invocation to avoid concurrency issues.

---

## 7) Backup Plan (if live APIs degrade or timer is strict)

If network or external services become unstable, keep exactly this command:

```bash
bash scripts/showcase-2min.sh
```

Message:

- "This preserves the full multi-agent pipeline while using simulated data."
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
- [ ] Run `bash scripts/showcase-2min.sh` on stage
- [ ] Pre-run `bash scripts/showcase-2min.sh --live` before stage
- [ ] Keep one saved result screenshot as hard backup
- [ ] End with `npx tsx src/index.ts --showcase-report`

