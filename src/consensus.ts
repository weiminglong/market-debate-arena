import { round3 } from "./util.js";
import type { ConsensusResult, Side, Vote } from "./types.js";

export function computeConsensus(votes: Vote[]): ConsensusResult {
  if (votes.length === 0) {
    throw new Error("cannot compute consensus with zero valid votes");
  }

  // The panel's aggregate estimate is the mean of the judges' independent
  // P(YES); the discrete winner follows from it, so the verdict and the
  // tradeable probability can never disagree.
  const modelProbability = round3(
    votes.reduce((sum, v) => sum + v.probabilityYes, 0) / votes.length
  );
  const winner: Side = modelProbability >= 0.5 ? "YES" : "NO";

  const yesVotes = votes.filter((v) => v.probabilityYes >= 0.5).length;
  const noVotes = votes.length - yesVotes;

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
    unanimous: yesVotes === votes.length || noVotes === votes.length,
    averageConfidence: round3(avgConfidence),
    modelProbability,
  };
}
