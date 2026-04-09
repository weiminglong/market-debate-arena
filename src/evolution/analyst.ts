import { runClaude } from "../claude-runner.js";
import type { GenerationResult, Playbook } from "../types.js";

const ANALYST_SYSTEM = `You are a research strategy analyst. You review debate results to identify what research strategies worked and evolve the strategy playbook.

You receive:
- Debate results: which side won, what evidence they used, judge reasoning, and whether the result aligned with the market
- The current playbook of research lessons

Your job: update the playbook to improve future debate performance.

Respond with JSON in this exact format:
{
  "lessons": ["lesson 1", "lesson 2", ...],
  "toolPriority": ["tool1", "tool2", ...],
  "avoidPatterns": ["pattern to avoid 1", ...],
  "keyMutation": "one-line description of the biggest change this generation"
}

Rules:
- Keep total lessons under 10 (drop least useful ones)
- Keep avoidPatterns under 5
- toolPriority must include all 10 tools: getPrice, getTechnicalIndicator, getOnChainIndicator, getSocialMindshare, getSocialDetail, getNewsFeed, getSmartMoney, getMarketRanking, getDeFiMetrics, getFearGreed
- If a lesson from the previous playbook led to worse scores, remove it
- Be specific and actionable: "Use RSI + price trend together" not "Use good data"

IMPORTANT: Only output the JSON object. No other text.`;

export async function evolvePlaybook(
  generationResult: GenerationResult,
  currentPlaybook: Playbook
): Promise<{ playbook: Playbook; keyMutation: string }> {
  const debateSummaries = generationResult.debates.map((d) => ({
    question: d.market.question,
    marketPrice: d.market.latestPrice,
    winner: d.consensus.winner,
    score: d.score,
    aligned: d.score > 0.5,
    unanimous: d.consensus.unanimous,
    yesClaimSources: d.yesArgument.claims.map((c) => c.source),
    noClaimSources: d.noArgument.claims.map((c) => c.source),
    yesSummary: d.yesArgument.summary.slice(0, 200),
    noSummary: d.noArgument.summary.slice(0, 200),
    judgeReasoning: d.consensus.votes.map((v) => v.reasoning.slice(0, 150)),
  }));

  const prompt = `GENERATION ${generationResult.generation} RESULTS:
Average Score: ${generationResult.averageScore}

CURRENT PLAYBOOK:
Lessons: ${currentPlaybook.lessons.length > 0 ? currentPlaybook.lessons.join("; ") : "(none — first generation)"}
Tool Priority: ${currentPlaybook.toolPriority.join(", ")}
Avoid: ${currentPlaybook.avoidPatterns.length > 0 ? currentPlaybook.avoidPatterns.join("; ") : "(none)"}

DEBATE RESULTS:
${JSON.stringify(debateSummaries, null, 2)}

Analyze these results and produce an updated playbook. Focus on:
1. Which tools appeared in winning arguments vs losing ones?
2. What patterns did judges reward or penalize?
3. Which current lessons held up? Which should be dropped?`;

  const output = await runClaude(prompt, {
    systemPrompt: ANALYST_SYSTEM,
    model: "sonnet",
  });

  const jsonMatch = output.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { playbook: currentPlaybook, keyMutation: "analyst returned non-JSON" };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const newPlaybook: Playbook = {
      generation: generationResult.generation,
      lessons: parsed.lessons || currentPlaybook.lessons,
      toolPriority: parsed.toolPriority || currentPlaybook.toolPriority,
      avoidPatterns: parsed.avoidPatterns || currentPlaybook.avoidPatterns,
    };
    return {
      playbook: newPlaybook,
      keyMutation: parsed.keyMutation || "unknown",
    };
  } catch {
    return { playbook: currentPlaybook, keyMutation: "analyst JSON parse failed" };
  }
}
