import express, { raw } from 'express';
import z from 'zod';
import { routeUserIntent, type RouteDecision } from '../agent/router.agent';
import { getWeather } from '../tools/weather';
import { calculateMath } from '../tools/math';
import { getExchangeRate } from '../tools/exchange';
import { addMessage } from '../../src/memory/chat.memory';
import { analyzeReview } from '../tools/analyzeReview';
import { callLocalLLM } from '../../llm/ollama.client';
import { analyzeWithPython } from '../../llm/bert.python';
import OneShotClassification from '../../prompts/oneShotClassifier.txt';
import assitance from '../../prompts/ollamaAsistace.txt';
import { chatService } from '../../services/chat.service';
import { decideIntent } from '../agent/router.agent.decision';
import { executeDecision } from '../../services/execution.service';

const router = express.Router();

const agentRequestSchema = z.object({
   prompt: z.string().trim().min(1, 'User input is required'),
   conversationId: z.string().uuid('Invalid conversation ID'),
});

type AgentRequest = z.infer<typeof agentRequestSchema>;

// POST /api/agent
router.post('/api/agent', async (req, res) => {
   const parseResult = agentRequestSchema.safeParse(req.body);
   if (!parseResult.success) {
      return res.status(400).json({ errors: parseResult.error.format() });
   }
   const { prompt: userInput, conversationId } =
      parseResult.data as AgentRequest;

   try {
      addMessage({ role: 'user', content: userInput });
      const decision = await decideIntent(userInput);

      const result = await executeDecision(decision, userInput, conversationId);
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
