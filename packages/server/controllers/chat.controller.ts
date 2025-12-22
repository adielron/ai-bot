import type { Request, Response } from 'express';
import z from 'zod';
import { chatService } from '../services/chat.service';

const chatRequestSchema = z.object({
   prompt: z
      .string()
      .trim()
      .min(1, 'Prompt is required')
      .max(1000, 'Prompt is too long'),
   conversationId: z.string().uuid(),
});

export const chatController = {
   async sendMessgae(req: Request, res: Response) {
      const parseResult = chatRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
         res.status(400).json({ errors: parseResult.error.format() });
      }

      try {
         const { prompt, conversationId } = req.body;
         const response = await chatService.sendMesssage(
            prompt,
            conversationId
         );
         res.json({ message: response.message });
      } catch (error) {
         res.status(500).json({
            error: 'Failed to fetch response from OpenAI',
         });
      }
   },
};
