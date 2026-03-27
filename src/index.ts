import express, { Express } from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import http from 'http';

import authRouter from './routes/auth.js';
import chatsRouter from './routes/chats.js';
import { errorHandler } from './middleware/error.js';

import billingRouter from './routes/billing.js'

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(compression());
app.use(morgan('dev'));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/chats', chatsRouter);

app.get('/', (req, res) => {
  res.json({ message: 'LLM Chat Backend is running 🚀' });
});

// Error handling — важно использовать как error middleware
app.use(errorHandler);

app.use('/api/billing', billingRouter)

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});