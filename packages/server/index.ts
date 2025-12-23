import express from 'express';
import dotenv from 'dotenv';
import router from './routes.ts';
import agentRoutes from './src/routes/chat.route.ts'; // import the agent router

import { loadHistory } from './src/memory/chat.memory.ts';

dotenv.config();

const app = express();
app.use(express.json());

await loadHistory();

app.use(router);
app.use(agentRoutes); // use the agent router

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
   console.log(`Server is running on http://localhost:${PORT}`);
});
