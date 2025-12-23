import OpenAI from 'openai';

const client = new OpenAI({
   apiKey: process.env.OPENAI_API_KEY,
});

/**
 * סוגי הפעולות שהסוכן יודע לנתב אליהן
 */
export type RouteDecision =
   | { type: 'weather'; city: string }
   | { type: 'math'; expression: string }
   | { type: 'exchange'; currency: string }
   | { type: 'chat' };

/**
 * פונקציית הניתוב הראשית
 */
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
            content: `
You are an intent classification engine.

Your job is to classify the user's input into ONE of the following intents
and extract the required parameter.

Return ONLY valid JSON. No explanations.

Intents:

1. weather
   - parameter: city (string)

2. math
   - parameter: expression (string)

3. exchange
   - parameter: currency (string, like USD, EUR)

4. chat
   - no parameters

JSON formats:

Weather:
{ "type": "weather", "city": "Haifa" }

Math:
{ "type": "math", "expression": "50 * 3 / 2" }

Exchange:
{ "type": "exchange", "currency": "USD" }

Chat:
{ "type": "chat" }
        `,
         },
         {
            role: 'user',
            content: userInput,
         },
      ],
   });

   const output = response.output_text;
   console.log('LLM raw output:', output);

   try {
      return JSON.parse(output) as RouteDecision;
   } catch {
      return { type: 'chat' };
   }
}
