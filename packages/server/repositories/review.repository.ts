import { prisma } from '../src/db/prisma';
import { type ReviewType } from '../services/review.service';
import dayjs from 'dayjs';

export const reviewRepository = {
   // Add review-related data access methods here in the future
   async getReviews(productId: number, limit?: number): Promise<ReviewType[]> {
      return prisma.review.findMany({
         where: { productId },
         orderBy: { createdAt: 'desc' },
         take: limit,
      });
   },

   storeReviewSummary(productId: number, summary: string) {
      const now = new Date();
      const expiresAt = dayjs().add(7, 'days').toDate();
      const data = {
         content: summary,
         expiresAt: expiresAt,
         generatedAt: now,
         productId: productId,
      };

      return prisma.summary.upsert({
         where: { productId },
         create: data,
         update: data,
      });
   },
};
