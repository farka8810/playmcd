import { createServer } from 'node:http';
import next from 'next';
import { Server as SocketServer } from 'socket.io';
import { registerSocketHandlers } from './server/socket.js';
import { ensureSchema } from './db/index.js';

// Custom Node server so Next.js and the Socket.IO server share ONE HTTP server
// and ONE port. Next handles all normal HTTP/page requests; Socket.IO
// intercepts its own "/socket.io" path (including the WebSocket upgrade) and
// delegates everything else back to Next.
const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Make sure the leaderboard table exists (no manual db:setup on deploy).
  // Non-fatal: the game is client-side and still runs if the DB is unreachable.
  if (process.env.DATABASE_URL) {
    try {
      await ensureSchema();
      console.log('> db schema ready');
    } catch (err) {
      console.error('> db schema init failed:', err.message);
    }
  }

  const httpServer = createServer((req, res) => handle(req, res));

  const io = new SocketServer(httpServer, {
    cors: { origin: dev ? '*' : false },
  });
  registerSocketHandlers(io);

  httpServer.listen(port, () => {
    console.log(`> playmcd ready on http://${hostname}:${port}`);
  });
});
