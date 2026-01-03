import { type RouteDecision } from '../src/agent/router.agent';
import { getWeather } from '../src/tools/weather';
import { calculateMath } from '../src/tools/math';
import { getExchangeRate } from '../src/tools/exchange';
import { analyzeReview } from '../src/tools/analyzeReview';
import { analyzeWithPython } from '../llm/bert.python';
import { chatService } from './chat.service';

export async function executeDecision(
   decision: RouteDecision,
   userInput: string,
   conversationId: string
): Promise<string> {
   switch (decision.intent) {
      case 'weather':
         return getWeather(decision.parameters.city);

      case 'math':
         return calculateMath(decision.parameters.expression);

      case 'exchange':
         return getExchangeRate(decision.parameters.currency);

      case 'analyzeReview':
         if (decision.confidence < 0.9) {
            const pythonResult = await analyzeWithPython(
               decision.parameters.reviewText
            );
            return `Sentiment: ${pythonResult.sentiment}, Confidence: ${pythonResult.confidence}`;
         }
         return analyzeReview(decision.parameters.reviewText);

      case 'chat':
      default:
         const response = await chatService.sendMessage(
            userInput,
            conversationId
         );
         return response.message;
   }
}
