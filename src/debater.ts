// src/debater.ts
import Anthropic from "@anthropic-ai/sdk";
import { DEBATER_TOOLS, executeTool } from "./tools/index.js";
import type { Argument, Claim, Market, Playbook, Side } from "./types.js";

const client = new Anthropic();

const MAX_TOOL_CALLS = 10;

function buildSystemPrompt(side: Side, market: Market, playbook: Playbook): string {
  let prompt = `You are a crypto research analyst assigned to argue the ${side} side of a prediction market debate.

MARKET QUESTION: ${market.question}
CURRENT MARKET PRICE: ${market.latestPrice} (probability of YES)
YOUR SIDE: ${side}

Your job is to build the strongest possible case for ${side} using real data from the tools available to you. You have up to ${MAX_TOOL_CALLS} tool calls — use them wisely.

Research strategy:
1. Think about what data would support the ${side} case
2. Use tools to gather evidence across multiple domains (price, on-chain, social, news, etc.)
3. Build your argument with specific, data-backed claims

After gathering evidence, respond with your final argument as JSON in this exact format:
{
  "side": "${side}",
  "claims": [
    {
      "claim": "specific factual claim backed by data",
      "source": "tool_name_used",
      "data": { "key data points from the tool response" },
      "reasoning": "why this supports ${side}"
    }
  ],
  "summary": "your overall argument for ${side}"
}

IMPORTANT: Only output the JSON object as your final response. No other text.`;

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
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Research and build your case for ${side} on: "${market.question}". Use the available tools to gather evidence, then present your structured argument as JSON.`,
    },
  ];

  let toolCallCount = 0;

  while (toolCallCount < MAX_TOOL_CALLS) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: buildSystemPrompt(side, market, playbook),
      tools: DEBATER_TOOLS,
      messages,
    });

    if (response.stop_reason === "tool_use") {
      const assistantContent = response.content;
      messages.push({ role: "assistant", content: assistantContent });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of assistantContent) {
        if (block.type === "tool_use") {
          toolCallCount++;
          if (verbose) {
            console.log(`    [${side}] Tool ${toolCallCount}/${MAX_TOOL_CALLS}: ${block.name}(${JSON.stringify(block.input)})`);
          }
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    } else {
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error(`${side} debater returned no text response`);
      }

      return parseArgument(textBlock.text, side);
    }
  }

  // Hit tool call limit — force a final response without tools
  messages.push({
    role: "user",
    content:
      "You have used all your tool calls. Now present your final argument as JSON based on the evidence gathered so far.",
  });

  const finalResponse = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: buildSystemPrompt(side, market, playbook),
    messages,
  });

  const textBlock = finalResponse.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`${side} debater returned no final text`);
  }

  return parseArgument(textBlock.text, side);
}

function parseArgument(text: string, side: Side): Argument {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
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
      summary: text,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Argument;
    return { ...parsed, side };
  } catch {
    return {
      side,
      claims: [],
      summary: text,
    };
  }
}
