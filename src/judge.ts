import { runAgent, type AgentRuntime } from "./agent-runner.js";
import { extractLastJSONObject } from "./json-extract.js";
import type { Argument, Vote } from "./types.js";

const JUDGE_SYSTEM = `You are an impartial judge evaluating a debate between two AI research agents about a prediction market question. Each agent has presented evidence-backed arguments for their side.

Evaluate both sides on:
1. Evidence relevance — Is the data directly relevant to the prediction question?
2. Data recency — Is the evidence recent and timely?
3. Source diversity — Did the agent use multiple data domains (price, on-chain, social, news)?
4. Logical coherence — Does the reasoning follow from the evidence?

You must pick a winner. Respond with JSON in this exact format:
{
  "winner": "YES" or "NO",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation of why this side's evidence was stronger"
}

IMPORTANT: Only output the JSON object. No other text.`;

export async function runJudge(
  question: string,
  yesArgument: Argument,
  noArgument: Argument,
  runtime: AgentRuntime = "claude"
): Promise<Vote> {
  const prompt = `PREDICTION MARKET QUESTION: ${question}

=== YES TEAM ARGUMENT ===
Summary: ${yesArgument.summary}

Claims:
${yesArgument.claims
  .map(
    (c, i) =>
      `${i + 1}. [${c.source}] ${c.claim}\n   Reasoning: ${c.reasoning}`
  )
  .join("\n")}

=== NO TEAM ARGUMENT ===
Summary: ${noArgument.summary}

Claims:
${noArgument.claims
  .map(
    (c, i) =>
      `${i + 1}. [${c.source}] ${c.claim}\n   Reasoning: ${c.reasoning}`
  )
  .join("\n")}

Which side presented a stronger, more well-evidenced case? Vote now.`;

  const output = await runAgent(runtime, prompt, {
    systemPrompt: JUDGE_SYSTEM,
    model: "haiku",
  });

  return parseVote(output);
}

function parseVote(text: string): Vote {
  const jsonMatch = extractLastJSONObject(text);
  if (!jsonMatch) {
    return { winner: "YES", confidence: 0.5, reasoning: text };
  }

  try {
    const parsed = JSON.parse(jsonMatch);
    return {
      winner: parsed.winner === "NO" ? "NO" : "YES",
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
      reasoning: parsed.reasoning || "",
    };
  } catch {
    return { winner: "YES", confidence: 0.5, reasoning: text };
  }
}
