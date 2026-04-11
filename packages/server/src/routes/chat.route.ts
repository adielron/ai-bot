import express from 'express';
import z from 'zod';
import { addMessage } from '../../src/memory/chat.memory';
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
   const requestStart = performance.now();
   console.log(
      '📨 [API] Received /api/agent request with prompt:',
      req.body.prompt?.substring(0, 50) + '...'
   );
   const parseResult = agentRequestSchema.safeParse(req.body);
   if (!parseResult.success) {
      console.error('❌ [API] Validation failed:', parseResult.error.format());
      return res.status(400).json({ errors: parseResult.error.format() });
   }
   const { prompt: userInput, conversationId } =
      parseResult.data as AgentRequest;

   try {
      const processingStart = performance.now();
      console.log('💬 [API] Added user message to memory.');
      addMessage({ role: 'user', content: userInput });

      // 1. Check what the Router decided
      console.log('🔀 [API] Calling router for intent classification...');
      const decision = await decideIntent(userInput);
      console.log(
         '📂 [API] Router decision:',
         JSON.stringify(decision.plan, null, 2)
      );
      console.log(
         '🤖 [API] Synthesis Required:',
         decision.final_answer_synthesis_required
      );

      // 2. Check the results from the tools
      console.log('⚙️ [API] Starting tool execution...');
      const result = await executeDecision(decision, userInput, conversationId);
      console.log(
         '✅ [API] Tool execution completed. Result length:',
         result.length
      );
      if (!result) {
         console.warn('⚠️ [API] Warning: result is empty or undefined!');
      } else {
         console.log(
            '📝 [API] Result preview:',
            result.substring(0, 100) + '...'
         );
      }

      // 3. Final Response send-off
      const processingEnd = performance.now();
      console.log(
         `⏱️ [API] Total processing time: ${(processingEnd - processingStart).toFixed(2)}ms`
      );
      res.json({
         success: true,
         message: result,
         intent: decision.plan.map((p) => (typeof p === 'string' ? p : p.tool)),
      });

      const requestEnd = performance.now();
      console.log(
         `🚀 [API] Full request completed in ${(requestEnd - requestStart).toFixed(2)}ms`
      );
   } catch (error) {
      console.error('❌ [API] Critical error:', error);
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
