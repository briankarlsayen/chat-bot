import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http';
dotenv.config();
import { AI21 } from 'langchain/llms/ai21';

console.log('d', process.env.AI21_KEY);
const llm = new AI21({
  ai21ApiKey: process.env.AI21_KEY,
  temperature: 0.9,
});

const app: Express = express();
const port = process.env.PORT ?? 5905;
app.use(cors());
app.use(express.json());
const server = http.createServer(app);

app.post('/chat', async (req: Request, res: Response) => {
  const { prompt } = req.body;
  try {
    const response = await llm.call(prompt);
    return res.status(200).json(response);
  } catch (error) {
    console.log('error', error);
  }
});

server.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
