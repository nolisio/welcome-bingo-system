import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { registerSocketHandlers } from './socket/handlers';
import apiRouter from './routes/api';

const PORT = Number(process.env.PORT) || 4000;
const CLIENT_URLS = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((u) => u.trim());
const ALLOWED_ORIGINS = [
  ...CLIENT_URLS,
  'http://localhost:3000',
  'http://localhost:3001',
];

const app = express();

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  }),
);
app.use(express.json());

// REST API
app.use('/api', apiRouter);

// HTTP server
const httpServer = http.createServer(app);

// Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

registerSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Bingo server running on http://localhost:${PORT}`);
  console.log(`   CORS allowed for: ${ALLOWED_ORIGINS.join(', ')}`);
});

export { io };
