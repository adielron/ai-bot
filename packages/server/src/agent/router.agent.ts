import OpenAI from 'openai';
import classifier from '../../prompts/classifier.prompt.txt';

const client = new OpenAI({
   apiKey: process.env.OPENAI_API_KEY,
});

export type RouteDecision = {
   intent: 'weather' | 'math' | 'exchange' | 'chat' | 'analyzeReview';
   parameters: Record<string, any>;
   confidence: number;
};

export async function routeUserIntent(
   userInput: string
): Promise<RouteDecision> {
   const response = await client.responses.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_output_tokens: 150,
      input: [
         {
            role: 'system',
            content: classifier,
         },
         {
            role: 'user',
            content: userInput,
         },
      ],
   });

   const decision = JSON.parse(response.output_text) as RouteDecision;
   console.log('decision: ', decision);

   try {
      return JSON.parse(response.output_text) as RouteDecision;
   } catch {
      return {
         intent: 'chat',
         parameters: {},
         confidence: 0,
      };
   }
}
