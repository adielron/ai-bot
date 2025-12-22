const conversation = new Map<string, string>();

export const conversationRepositories = {
   getLastResponseId(conversationId: string) {
      return conversation.get(conversationId);
   },

   setLastResponseId(conversationId: string, responseId: string) {
      conversation.set(conversationId, responseId);
   },
};
