import fs from 'fs';
import path from 'path';

const HISTORY_PATH = path.join(process.cwd(), 'history.json');

export type Message = {
   role: 'user' | 'assistant';
   content: string;
};

let history: Message[] = [];

/**
 * Load conversation history on server startup
 */
export async function loadHistory() {
   if (fs.existsSync(HISTORY_PATH)) {
      const file = Bun.file(HISTORY_PATH);
      history = await file.json();
      console.log('👋 Welcome back! Conversation history loaded.');
   } else {
      history = [];
      console.log('🆕 New conversation started.');
   }
}

/**
 * Save conversation history
 */
export async function saveHistory() {
   await Bun.write(HISTORY_PATH, JSON.stringify(history, null, 2));
}

/**
 * Accessors
 */
export function getHistory(): Message[] {
   return history;
}

export async function addMessage(message: Message) {
   history.push(message);
   await saveHistory();
}

export async function resetHistory() {
   history = [];
   await Bun.write(HISTORY_PATH, JSON.stringify([]));
}
