import type { ReviewAnalysis } from './analyzeReview';

export function hasSentimentConflict(analysis: ReviewAnalysis): boolean {
   return analysis.overall_sentiment === 'Positive' && analysis.score < 4;
}

export const REVIEW_FIX_PROMPT = `
You are validating a review analysis.

The following JSON contains an inconsistency.
The original review text is provided.

Fix the inconsistency and return ONLY corrected JSON
using the SAME schema.

Do not add new aspects.
Do not remove relevant aspects.
`;
