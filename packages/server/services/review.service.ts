import { prisma } from '../src/db/prisma';
import { reviewRepository } from '../repositories/review.repository';
import { llmClient } from '../llm/client';
import template from '../prompts/summarize-reviews.txt';

// Infer the type of a Review from the Prisma client
export type ReviewType = Awaited<ReturnType<typeof prisma.review.findFirst>>;

export const reviewService = {
   async getReviews(productId: number): Promise<ReviewType[]> {
      return await reviewRepository.getReviews(productId);
   },

   async summarizeReviews(productId: number): Promise<string> {
      const reviews = await reviewRepository.getReviews(productId, 10);
      const joinedReviews = reviews
         .map((r) => r?.content)
         .filter(Boolean)
         .join('\n\n');
      const prompt = template.replace('{{reviews}}', joinedReviews);

      const { text: summary } = await llmClient.generateText({
         model: 'gpt-4.1',
         prompt,
         maxTokens: 500,
         temperature: 0.2,
      });

      await reviewRepository.storeReviewSummary(productId, summary);
      return summary;
   },
};
