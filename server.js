import { createServer } from 'node:http';
import next from 'next';
import { Server as SocketServer } from 'socket.io';
import { registerSocketHandlers } from './server/socket.js';

// Custom Node server so Next.js and the Socket.IO server share ONE HTTP server
// and ONE port. Next handles all normal HTTP/page requests; Socket.IO
// intercepts its own "/socket.io" path (including the WebSocket upgrade) and
// delegates everything else back to Next.
const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new SocketServer(httpServer, {
    cors: { origin: dev ? '*' : false },
  });
  registerSocketHandlers(io);

  httpServer.listen(port, () => {
    console.log(`> playmcd ready on http://${hostname}:${port}`);
  });
});
