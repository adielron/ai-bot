import express from 'express';
import z from 'zod';
import { routeUserIntent } from '../agent/router.agent';
import { getWeather } from '../tools/weather';
import { calculateMath } from '../tools/math';
import { getExchangeRate } from '../tools/exchange';
import { chatService } from '../../services/chat.service';
import { addMessage } from '../../src/memory/chat.memory';

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
      // Determine the user's intent and parameters
      addMessage({ role: 'user', content: userInput });

      const decision = await routeUserIntent(userInput);

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
         case 'chat':
         default:
            // Call chatService directly
            const response = await chatService.sendMessage(
               userInput,
               conversationId
            );
            result = response.message;
            break;
      }

      res.json({ message: result });
   } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to process user input' });
   }
});

export default router;
