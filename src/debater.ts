import { runClaude } from "./claude-runner.js";
import type { Argument, Market, Playbook, Side } from "./types.js";

function buildSystemPrompt(side: Side, market: Market, playbook: Playbook): string {
  let prompt = `You are a crypto research analyst assigned to argue the ${side} side of a prediction market debate.

MARKET QUESTION: ${market.question}
CURRENT MARKET PRICE: ${market.latestPrice} (probability of YES)
YOUR SIDE: ${side}

Your job is to build the strongest possible case for ${side} using real data. You have access to the "surf" CLI for crypto data. Use bash to run surf commands.

Available surf commands (use -o json -f body.data for structured output):
- surf market-price --symbol BTC (price history)
- surf market-price-indicator --indicator rsi --symbol BTC (RSI, MACD, bollinger)
- surf market-onchain-indicator --symbol BTC --metric nupl (on-chain: nupl, sopr)
- surf social-mindshare --q bitcoin (social buzz trends)
- surf social-detail --q bitcoin (social analytics)
- surf news-feed --limit 5 (recent crypto news)
- surf news-feed --project bitcoin --limit 5 (project-specific news)
- surf polymarket-smart-money (smart money/whale activity)
- surf market-ranking --limit 10 (token rankings)
- surf project-defi-metrics --q aave (DeFi TVL, fees)
- surf market-fear-greed (fear & greed index)
- surf search-prediction-market --q "query" (find prediction markets)

Research strategy:
1. Think about what data would support the ${side} case
2. Run surf commands to gather evidence across multiple domains
3. Build your argument with specific, data-backed claims
4. Limit yourself to 6-8 surf commands to stay focused

After gathering evidence, output your final argument as JSON in this exact format:
{
  "side": "${side}",
  "claims": [
    {
      "claim": "specific factual claim backed by data",
      "source": "surf command used",
      "data": { "key data points from the response" },
      "reasoning": "why this supports ${side}"
    }
  ],
  "summary": "your overall argument for ${side}"
}

IMPORTANT: Your very last output must be ONLY the JSON object. No other text after it.`;

  if (playbook.lessons.length > 0) {
    prompt += `\n\nSTRATEGY PLAYBOOK (learned from prior generations):`;
    prompt += `\nLessons: ${playbook.lessons.join("; ")}`;
    prompt += `\nTool priority: ${playbook.toolPriority.join(", ")}`;
    if (playbook.avoidPatterns.length > 0) {
      prompt += `\nAvoid: ${playbook.avoidPatterns.join("; ")}`;
    }
  }

  return prompt;
}

export async function runDebater(
  side: Side,
  market: Market,
  playbook: Playbook,
  verbose: boolean = false
): Promise<Argument> {
  if (verbose) {
    console.log(`    [${side}] Researching with surf tools...`);
  }

  const userPrompt = `Research and build your case for ${side} on: "${market.question}". Run surf commands to gather evidence, then present your structured argument as JSON.`;

  const output = await runClaude(userPrompt, {
    systemPrompt: buildSystemPrompt(side, market, playbook),
    allowBash: true,
    model: "sonnet",
  });

  if (verbose) {
    const lines = output.split("\n").length;
    console.log(`    [${side}] Got response (${lines} lines)`);
  }

  return parseArgument(output, side);
}

function parseArgument(text: string, side: Side): Argument {
  // Find the last JSON object in the output (the final argument)
  const jsonMatches = text.match(/\{[\s\S]*?"side"[\s\S]*?"claims"[\s\S]*?\}/g);
  const jsonStr = jsonMatches ? jsonMatches[jsonMatches.length - 1] : null;

  if (!jsonStr) {
    // Try a simpler match for any JSON object
    const simpleMatch = text.match(/\{[\s\S]*\}$/m);
    if (simpleMatch) {
      try {
        const parsed = JSON.parse(simpleMatch[0]) as Argument;
        return { ...parsed, side };
      } catch {
        // fall through
      }
    }
    return {
      side,
      claims: [
        {
          claim: text.slice(0, 200),
          source: "direct-response",
          data: {},
          reasoning: text,
        },
      ],
      summary: text.slice(0, 500),
    };
  }

  try {
    const parsed = JSON.parse(jsonStr) as Argument;
    return { ...parsed, side };
  } catch {
    return {
      side,
      claims: [],
      summary: text.slice(0, 500),
    };
  }
}
