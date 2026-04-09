import type { ConsensusResult, Side, Vote } from "./types.js";

export function computeConsensus(votes: Vote[]): ConsensusResult {
  const yesVotes = votes.filter((v) => v.winner === "YES").length;
  const noVotes = votes.filter((v) => v.winner === "NO").length;
  const winner: Side = yesVotes >= noVotes ? "YES" : "NO";

  const avgConfidence =
    votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length;

  return {
    winner,
    votes,
    unanimous: yesVotes === votes.length || noVotes === votes.length,
    averageConfidence: Math.round(avgConfidence * 1000) / 1000,
  };
}
