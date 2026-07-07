import { runAgent, type AgentRuntime } from "../agent-runner.js";
import { extractLastJSONObject } from "../json-extract.js";
import { MODELS } from "../config.js";
import { sanitizePlaybook } from "./playbook.js";
import {
  KNOWN_TOOLS,
  type EvolutionHistoryEntry,
  type GenerationResult,
  type Playbook,
} from "../types.js";

const ANALYST_SYSTEM = `You are a research strategy analyst. You review debate results to identify what research strategies worked and evolve the strategy playbook.

You receive:
- Debate results: which side won, what evidence they used, judge reasoning, and whether the result aligned with the market
- The current playbook of research lessons
- Score history across prior generations, including which mutations preceded improvements or regressions

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
- toolPriority must include all 10 tools: ${KNOWN_TOOLS.join(", ")}
- Use the score history: if a mutation preceded a score drop, remove or reverse it; if it preceded a gain, build on it
- Be specific and actionable: "Use RSI + price trend together" not "Use good data"

IMPORTANT: Only output the JSON object. No other text.`;

export async function evolvePlaybook(
  generationResult: GenerationResult,
  currentPlaybook: Playbook,
  runtime: AgentRuntime = "claude",
  history: EvolutionHistoryEntry[] = []
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

  const recentHistory = history.slice(-5).map((h) => ({
    generation: h.generation,
    averageScore: h.averageScore,
    keyMutation: h.keyMutation,
    reverted: h.reverted,
  }));

  const prompt = `GENERATION ${generationResult.generation} RESULTS:
Average Score: ${generationResult.averageScore}

SCORE HISTORY (previous generations; "reverted" means that generation's playbook regressed and was rolled back):
${recentHistory.length > 0 ? JSON.stringify(recentHistory, null, 2) : "(none — first generation)"}

CURRENT PLAYBOOK:
Lessons: ${currentPlaybook.lessons.length > 0 ? currentPlaybook.lessons.join("; ") : "(none — first generation)"}
Tool Priority: ${currentPlaybook.toolPriority.join(", ")}
Avoid: ${currentPlaybook.avoidPatterns.length > 0 ? currentPlaybook.avoidPatterns.join("; ") : "(none)"}

DEBATE RESULTS:
${JSON.stringify(debateSummaries, null, 2)}

Analyze these results and produce an updated playbook. Focus on:
1. Which tools appeared in winning arguments vs losing ones?
2. What patterns did judges reward or penalize?
3. Which mutations in the score history helped or hurt? Build on gains, reverse regressions.`;

  const output = await runAgent(runtime, prompt, {
    systemPrompt: ANALYST_SYSTEM,
    model: MODELS.analyst,
  });

  // On unparseable analyst output, keep the current playbook but still advance
  // the generation counter so subsequent runs don't reuse a stale number.
  const unchanged = (reason: string) => ({
    playbook: { ...currentPlaybook, generation: generationResult.generation },
    keyMutation: reason,
  });

  const jsonMatch = extractLastJSONObject(output);
  if (!jsonMatch) {
    return unchanged("analyst returned non-JSON (playbook unchanged)");
  }

  try {
    const parsed = JSON.parse(jsonMatch);
    // The analyst is an LLM writing state that gets re-injected into future
    // bash-enabled prompts — sanitize structurally before accepting.
    const newPlaybook = sanitizePlaybook({
      generation: generationResult.generation,
      lessons: parsed.lessons ?? currentPlaybook.lessons,
      toolPriority: parsed.toolPriority ?? currentPlaybook.toolPriority,
      avoidPatterns: parsed.avoidPatterns ?? currentPlaybook.avoidPatterns,
    });
    return {
      playbook: newPlaybook,
      keyMutation:
        typeof parsed.keyMutation === "string" && parsed.keyMutation.trim()
          ? parsed.keyMutation.slice(0, 300)
          : "unknown",
    };
  } catch {
    return unchanged("analyst JSON parse failed (playbook unchanged)");
  }
}
