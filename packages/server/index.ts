import express from 'express';
import dotenv from 'dotenv';
dotenv.config() ;



import type {Request, Response} from 'express';

const app = express();
const PORT = process.env.PORT || 3000;



app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});


app.get('/', (req: Request, res: Response) => {
  res.send("Hello, World!");
});