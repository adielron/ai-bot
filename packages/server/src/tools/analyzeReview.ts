import template from '../../prompts/reviewAnalyzerPrompt.txt';
import { llmClient } from '../../llm/client.ts';
import { hasSentimentConflict, REVIEW_FIX_PROMPT } from './inconsistancy.ts';

export type ReviewAnalysis = {
   summary: string;
   overall_sentiment: 'Positive' | 'Negative' | 'Neutral' | 'Mixed';
   score: number;
   aspects: {
      topic: string;
      sentiment: 'Positive' | 'Negative' | 'Neutral';
      detail: string;
   }[];
};

export async function analyzeReview(reviewText: string): Promise<string> {
   const analysis = await llmClient.generateText({
      model: 'gpt-4o-mini',
      prompt: reviewText,
      instructions: template,
      maxTokens: 300,
      temperature: 0.3,
   });

   try {
      const parsed: ReviewAnalysis = JSON.parse(analysis.text);

      if (hasSentimentConflict(parsed)) {
         const analysis = await llmClient.generateText({
            model: 'gpt-4o-mini',
            prompt: reviewText + '\n\n' + JSON.stringify(parsed),
            maxTokens: 300,
            temperature: 0.3,
            instructions: template + '\n\n' + REVIEW_FIX_PROMPT,
         });
         const parsed_fix: ReviewAnalysis = JSON.parse(analysis.text);
         console.log('fixing analyze');

         return JSON.stringify(parsed_fix, null, 2);
      }

      return JSON.stringify(parsed, null, 2);
   } catch (e) {
      console.error('Failed to parse analysis result:', e);
      return analysis.text;
   }
}
