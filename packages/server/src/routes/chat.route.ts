import express, { raw } from 'express';
import z from 'zod';
import { routeUserIntent, type RouteDecision } from '../agent/router.agent';
import { getWeather } from '../tools/weather';
import { calculateMath } from '../tools/math';
import { getExchangeRate } from '../tools/exchange';
import { addMessage } from '../../src/memory/chat.memory';
import { analyzeReview } from '../tools/analyzeReview';
import { callLocalLLM } from '../../llm/ollama.client';
import { analyzeWithPython } from '../tools/analyzeReviewHelper';
import OneShotClassification from '../../prompts/oneShotClassifier.txt';
import assitance from '../../prompts/ollamaAsistace.txt';
import { chatService } from '../../services/chat.service';

const router = express.Router();

const agentRequestSchema = z.object({
   prompt: z.string().trim().min(1, 'User input is required'),
   conversationId: z.string().uuid('Invalid conversation ID'),
});

type AgentRequest = z.infer<typeof agentRequestSchema>;

// POST /api/agent
router.post('/api/agent', async (req, res) => {
   // Validate request body
   const parseResult = agentRequestSchema.safeParse(req.body);
   if (!parseResult.success) {
      return res.status(400).json({ errors: parseResult.error.format() });
   }

   const { prompt: userInput, conversationId } =
      parseResult.data as AgentRequest;

   try {
      addMessage({ role: 'user', content: userInput });

      let decision: RouteDecision;

      try {
         const preDecision = await callLocalLLM(
            userInput,
            OneShotClassification
         );

         const parsed = JSON.parse(preDecision);
         console.log(parsed);

         if (
            !parsed.intent ||
            !parsed.parameters ||
            typeof parsed.confidence !== 'number'
         ) {
            console.log('❌ Invalid router JSON structure:', parsed);

            throw new Error('Invalid router JSON');
         }
         decision = parsed as RouteDecision;
      } catch {
         console.log('❌ Falling back to default open ai  router');
         decision = await routeUserIntent(userInput);
      }

      let result: string;

      // Route to the appropriate "app"
      switch (decision.intent) {
         case 'weather':
            result = await getWeather(decision.parameters.city);
            break;
         case 'math':
            result = calculateMath(decision.parameters.expression);
            break;
         case 'exchange':
            result = getExchangeRate(decision.parameters.currency);
            break;
         case 'analyzeReview':
            if (decision.confidence < 0.9) {
               const pythonResult = await analyzeWithPython(
                  decision.parameters.reviewText
               );
               result = `Sentiment: ${pythonResult.sentiment}, Confidence: ${pythonResult.confidence}`;
            } else {
               result = await analyzeReview(decision.parameters.reviewText);
            }
            break;
         case 'chat':
         default:
            // Call chatService directly
            const response = await chatService.sendMessage(
               userInput,
               conversationId
            );
            result = response.message;
            break;
            // result = await callLocalLLM(userInput,assitance);
            break;
      }

      res.json({ message: result });
   } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to process user input' });
   }
});

export default router;

/*
### LLM Benchmark Results

| Scenario                  | Model (Provider)              | Avg Response Time (ms) | Answer Quality (1–5) | Monetary Cost |
|---------------------------|-------------------------------|------------------------|----------------------|---------------|
| Intent Classification     | OpenAI GPT-3.5                | ~1,100 ms              | 5                    | $             |
| Intent Classification     | Local Ollama (Llama / Phi)    | ~50,000 ms             | 1                  | 0             |
| Sentiment Analysis        | Hugging Face (Python, BERT)   | ~2,000 ms              | 3                  | 0             |

*/

// would not use ollama at all for production due to speed and quality issues
// would use openai for routing and chat
// would use a python sentiment analysis model for reviews that are clearly classfied
