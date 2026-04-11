/**
 * Shared conversation context
 * Tools use this to share information and coordinate actions
 * This allows inter-tool communication without splitting queries
 */

export interface ConversationContext {
   conversationId: string;
   history: ContextEntry[];
   lastNumbers: number[];
   lastItemsFound: { code: string; name: string; price: number }[];
   lastAnswer: string;
}

export interface ContextEntry {
   timestamp: number;
   tool: string; // 'rag', 'math', 'weather', 'exchange'
   query: string;
   result: string;
   numbers?: number[];
   items?: { code: string; name: string; price: number }[];
}

// In-memory conversation storage
const conversations = new Map<string, ConversationContext>();

/**
 * Get or create a conversation context
 */
export function getOrCreateContext(
   conversationId: string
): ConversationContext {
   if (!conversations.has(conversationId)) {
      conversations.set(conversationId, {
         conversationId,
         history: [],
         lastNumbers: [],
         lastItemsFound: [],
         lastAnswer: '',
      });
   }
   return conversations.get(conversationId)!;
}

/**
 * Add an entry to conversation history
 * Tools call this after processing a query
 */
export function addContextEntry(
   conversationId: string,
   tool: string,
   query: string,
   result: string,
   numbers?: number[],
   items?: { code: string; name: string; price: number }[]
): void {
   const context = getOrCreateContext(conversationId);

   const entry: ContextEntry = {
      timestamp: Date.now(),
      tool,
      query,
      result,
      numbers,
      items,
   };

   context.history.push(entry);

   // Update context state with latest results
   if (numbers && numbers.length > 0) {
      context.lastNumbers = numbers;
   }
   if (items && items.length > 0) {
      context.lastItemsFound = items;
   }
   context.lastAnswer = result;

   console.log(
      `📝 [Context] Added ${tool} entry. History size: ${context.history.length}, Last numbers: [${context.lastNumbers.join(',')}]`
   );
}

/**
 * Get the last numbers found (e.g., by RAG) for use in math
 */
export function getLastNumbers(conversationId: string): number[] {
   const context = conversations.get(conversationId);
   return context?.lastNumbers ?? [];
}

/**
 * Get the last items found by RAG
 */
export function getLastItemsFound(
   conversationId: string
): { code: string; name: string; price: number }[] {
   const context = conversations.get(conversationId);
   return context?.lastItemsFound ?? [];
}

/**
 * Get conversation history for a user
 */
export function getHistory(
   conversationId: string,
   limit: number = 10
): ContextEntry[] {
   const context = conversations.get(conversationId);
   if (!context) return [];
   return context.history.slice(-limit);
}

/**
 * Clear conversation context (e.g., after session ends)
 */
export function clearContext(conversationId: string): void {
   conversations.delete(conversationId);
   console.log(`🗑️  [Context] Cleared conversation ${conversationId}`);
}

/**
 * Get context statistics
 */
export function getContextStats(conversationId: string) {
   const context = conversations.get(conversationId);
   if (!context) return null;

   return {
      conversationId,
      historyLength: context.history.length,
      lastNumbers: context.lastNumbers,
      lastItemsFound: context.lastItemsFound,
      lastAnswer: context.lastAnswer,
      activeSessions: conversations.size,
   };
}
