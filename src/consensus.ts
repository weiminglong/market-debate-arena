import type { ConsensusResult, Side, Vote } from "./types.js";

export function computeConsensus(votes: Vote[]): ConsensusResult {
  if (votes.length === 0) {
    throw new Error("cannot compute consensus with zero valid votes");
  }

  const yesVotes = votes.filter((v) => v.winner === "YES");
  const noVotes = votes.filter((v) => v.winner === "NO");

  let winner: Side;
  if (yesVotes.length !== noVotes.length) {
    winner = yesVotes.length > noVotes.length ? "YES" : "NO";
  } else {
    // Tied panel (possible when a judge abstains): break by total confidence
    // instead of a fixed side, which would systematically bias the scores.
    const yesConfidence = yesVotes.reduce((sum, v) => sum + v.confidence, 0);
    const noConfidence = noVotes.reduce((sum, v) => sum + v.confidence, 0);
    winner = yesConfidence >= noConfidence ? "YES" : "NO";
  }

  const finiteConfidences = votes
    .map((v) => v.confidence)
    .filter((c) => Number.isFinite(c));
  const avgConfidence =
    finiteConfidences.length > 0
      ? finiteConfidences.reduce((sum, c) => sum + c, 0) / finiteConfidences.length
      : 0;

  return {
    winner,
    votes,
    unanimous: yesVotes.length === votes.length || noVotes.length === votes.length,
    averageConfidence: Math.round(avgConfidence * 1000) / 1000,
  };
}
