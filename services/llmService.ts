const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-3.5-turbo';

// Content filtering for harmful/illegal requests
const ILLEGAL_KEYWORDS = [
   'illegal',
   'crime',
   'steal',
   'drug',
   'bomb',
   'weapon',
   'kill',
   'murder',
   'hack',
   'fraud',
   'counterfeit',
   'launder',
   'exploit',
   'abuse',
   'violence',
   'gun',
   'explosive',
   'poison',
   'terrorist',
   'ransom',
   'blackmail',
   'extortion',
   'rape',
   'assault',
   'molest',
   'harassment',
];

export function validateContentSafety(query: string): {
   isValid: boolean;
   reason?: string;
} {
   const lower = query.toLowerCase();

   for (const keyword of ILLEGAL_KEYWORDS) {
      if (lower.includes(keyword)) {
         return {
            isValid: false,
            reason: `I cannot assist with requests related to ${keyword}. This is against my usage policies.`,
         };
      }
   }

   return { isValid: true };
}

async function callOpenAI(
   messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
) {
   if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
   }

   const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
         'Content-Type': 'application/json',
         Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
         model: DEFAULT_MODEL,
         messages,
         temperature: 0.2,
      }),
   });

   const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: unknown;
   };
   if (!response.ok) {
      throw new Error(`OpenAI error: ${JSON.stringify(data.error ?? data)}`);
   }

   return data.choices?.[0]?.message?.content?.trim() ?? '';
}

function normalizeText(text: string) {
   return text.trim().toLowerCase();
}

function shouldUseMath(query: string) {
   const lower = normalizeText(query);
   return (
      /\b(calculate|what is|plus|minus|times|divide|multiplied|multiply|sum|total|all items|all products)\b/.test(
         lower
      ) || /[0-9]+\s*[+\-*/]/.test(lower)
   );
}

function heuristicToolSet(query: string) {
   const lower = normalizeText(query);
   if (
      /\b(weather|forecast|temperature|rain|sunny|cloud|wind|snow)\b/.test(
         lower
      )
   ) {
      return ['weather'];
   }
   if (
      /\b(convert|exchange|currency|usd|eur|ils|gbp|dollar|euro|shekel|pound)\b/.test(
         lower
      )
   ) {
      return ['exchange'];
   }
   if (shouldUseMath(query)) {
      if (
         /\b(product|item|catalog|available|price|cost|cheapest|lowest)\b/.test(
            lower
         )
      ) {
         return ['rag', 'math'];
      }
      return ['math'];
   }
   if (
      /\b(product|item|catalog|available|price|cost|cheapest|lowest)\b/.test(
         lower
      )
   ) {
      return ['rag'];
   }
   return ['chat'];
}

export async function decideToolSetWithLLM(query: string) {
   // Check for illegal/harmful content first
   const safety = validateContentSafety(query);
   if (!safety.isValid) {
      console.warn(`⚠️ Content safety check failed: ${safety.reason}`);
      return ['blocked'];
   }

   const system = `You are a strict tool planner. Return ONLY a JSON object: {"tools":[]}. 
   Rules:
   - Use 'rag' ONLY for products/items/catalog/prices.
   - Use 'math' ONLY for arithmetic/numbers/calculations.
   - Use 'weather' ONLY for weather/temperature.
   - Use 'exchange' ONLY for currency conversion.
   - IMPORTANT: If query mentions BOTH prices/products AND math operations (multiply, add, divide, etc), return BOTH: ["rag", "math"]
   - If it's a general greeting or query, use 'chat'.
   Choose the MINIMUM necessary tools.`;
   const user = `User query: "${query}"`;
   console.log('🧠 LLM tool prompt:', user);

   try {
      const answer = await callOpenAI([
         { role: 'system', content: system },
         { role: 'user', content: user },
      ]);
      console.log('🧠 LLM tool raw output:', answer);
      const parsed = JSON.parse(answer) as { tools?: string[] };
      if (Array.isArray(parsed.tools) && parsed.tools.length > 0) {
         const normalizedTools = parsed.tools.map((tool) => tool.toLowerCase());
         if (normalizedTools.includes('math') && !shouldUseMath(query)) {
            return normalizedTools.filter((tool) => tool !== 'math');
         }
         return normalizedTools;
      }
      return heuristicToolSet(query);
   } catch (error) {
      console.warn(
         '⚠️ LLM tool selection failed; using fallback heuristics.',
         error
      );
      return heuristicToolSet(query);
   }
}

export async function decideIntentWithLLM(query: string) {
   const tools = await decideToolSetWithLLM(query);
   return tools[0] ?? 'chat';
}

export async function renderRAGAnswerWithLLM(query: string, context: string) {
   const system = `You are a product catalog assistant. Your role is ONLY to:
1. Use the product information provided in context to answer questions about products, prices, and availability
2. Format the information clearly and naturally
3. DO NOT perform any calculations or math operations - if the query asks for calculations, just provide the price/numbers without calculating
4. If no facts match the query, say you could not find a match.`;
   const user = `User question: "${query}"\nProduct Information:\n${context}`;
   console.log('🧠 LLM answer prompt:', user);

   try {
      const answer = await callOpenAI([
         { role: 'system', content: system },
         { role: 'user', content: user },
      ]);
      console.log('🧠 LLM answer raw output:', answer);
      return answer;
   } catch (error) {
      console.warn('⚠️ LLM answer failed; returning local answer.', error);
      return context;
   }
}

export async function answerWithMathLLM(query: string, result: string) {
   const system = `You are a math assistant. Your goal is to:
1. Understand the user's mathematical question
2. Evaluate the math expression correctly
3. Provide a clear answer with explanation
Be concise and accurate.`;
   const user = `User question: "${query}"\nCalculation result: ${result}`;
   console.log('🤖 [MathLLM] Processing query:', query);

   try {
      const answer = await callOpenAI([
         { role: 'system', content: system },
         { role: 'user', content: user },
      ]);
      console.log('🤖 [MathLLM] Answer:', answer);
      return answer;
   } catch (error) {
      console.warn('⚠️ Math LLM failed; returning raw result.', error);
      return result;
   }
}

export async function answerWithWeatherLLM(query: string, weatherData: string) {
   const system = `You are a weather assistant. Your goal is to:
1. Understand what location and weather info the user wants
2. Provide weather information in a friendly, clear way
3. Include temperature, conditions, and any relevant details
Be helpful and accurate.`;
   const user = `User question: "${query}"\nWeather data: ${weatherData}`;
   console.log('🌦️  [WeatherLLM] Processing query:', query);

   try {
      const answer = await callOpenAI([
         { role: 'system', content: system },
         { role: 'user', content: user },
      ]);
      console.log('🌦️  [WeatherLLM] Answer:', answer);
      return answer;
   } catch (error) {
      console.warn('⚠️ Weather LLM failed; returning raw data.', error);
      return weatherData;
   }
}

export async function answerWithExchangeLLM(
   query: string,
   exchangeData: string
) {
   const system = `You are a currency exchange assistant. Your goal is to:
1. Understand what currency conversion the user wants
2. Provide exchange rates clearly
3. Help with currency calculations if needed
Be clear about exchange rates and any assumptions.`;
   const user = `User question: "${query}"\nExchange data: ${exchangeData}`;
   console.log('💱 [ExchangeLLM] Processing query:', query);

   try {
      const answer = await callOpenAI([
         { role: 'system', content: system },
         { role: 'user', content: user },
      ]);
      console.log('💱 [ExchangeLLM] Answer:', answer);
      return answer;
   } catch (error) {
      console.warn('⚠️ Exchange LLM failed; returning raw data.', error);
      return exchangeData;
   }
}

/**
 * Synthesize tool results into a natural, coherent answer
 * Called when multiple tools have been used and their results need to be combined
 */
export async function synthesizeToolResults(
   query: string,
   toolOutputs: Array<{ tool: string; output: string }>
) {
   if (toolOutputs.length === 0) {
      return 'No tool results to synthesize.';
   }

   if (toolOutputs.length === 1) {
      return toolOutputs[0]!.output; // Single tool, return as-is
   }

   // Multiple tools - synthesize into a coherent response
   const toolSummary = toolOutputs
      .map((t) => `[${t.tool.toUpperCase()}]:\n${t.output}`)
      .join('\n\n');

   const system = `You are a synthesis assistant. Your role is to:
1. Read the outputs from multiple tools
2. Combine them into a natural, coherent answer
3. Maintain all key information and numbers from tool outputs
4. Present the answer in a way that flows naturally and answers the user's original question
5. Do NOT add new information; only synthesize what's provided
Be clear, concise, and helpful.`;

   const user = `User's original question: "${query}"

Tool outputs to synthesize:
${toolSummary}

Please synthesize these tool outputs into a single, natural answer.`;

   console.log(
      '🎼 [Synthesizer] Combining outputs from ${toolOutputs.length} tools for query: "${query}"'
   );

   try {
      const answer = await callOpenAI([
         { role: 'system', content: system },
         { role: 'user', content: user },
      ]);
      console.log('🎼 [Synthesizer] Synthesized answer:', answer);
      return answer;
   } catch (error) {
      console.warn(
         '⚠️ Synthesizer LLM failed; returning raw tool summaries.',
         error
      );
      return toolSummary;
   }
}
