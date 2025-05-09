import express from 'express';
import { createServer } from 'http';
import { Boom } from '@hapi/boom';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } from '@adiwajshing/baileys';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { Server } from 'socket.io';

// ES module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet());
app.use(cors()); // Removed ALLOWED_ORIGINS environment variable
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.post('/api/generate-code', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber || !/^\d+$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    // Initialize WhatsApp connection
    const { state, saveCreds } = await useMultiFileAuthState("sessions");
    
    const socket = makeWASocket({
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
      },
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      getMessage: async () => null,
      maxMsgRetryCount: 3,
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 25000
    });

    // Handle connection updates
    socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      
      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        if ([
          DisconnectReason.badSession,
          DisconnectReason.connectionClosed,
          DisconnectReason.connectionLost,
          DisconnectReason.connectionReplaced,
          DisconnectReason.restartRequired,
          DisconnectReason.timedOut
        ].includes(reason)) {
          io.emit('reconnecting');
        } else if (reason === DisconnectReason.loggedOut) {
          io.emit('logged-out');
        }
      } else if (connection === 'open') {
        const sessionId = state.creds.me?.id || `session_${phoneNumber}_${Date.now()}`;
        io.emit('connected', { sessionId });
      }
    });

    // Handle credentials update
    socket.ev.on('creds.update', saveCreds);

    // Request pairing code if not registered
    if (!socket.authState.creds.registered) {
      const code = await socket.requestPairingCode(phoneNumber);
      return res.json({ code });
    }

  } catch (error) {
    console.error('Error generating code:', error);
    return res.status(500).json({ error: 'Failed to generate pairing code' });
  }
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start server with hardcoded port
const PORT = 3000; // Removed process.env.PORT
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
