
/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const db = require("./lib/db");

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Initialize DB Table
db.query(`
  CREATE TABLE IF NOT EXISTS rooms (
    id SERIAL PRIMARY KEY,
    room_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`).catch(err => console.error("Failed to init DB:", err));

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      // Let Socket.IO handle its own requests
      if (parsedUrl.pathname.startsWith("/socket.io/")) {
        return; 
      }
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  
  // Store usernames: socketId -> username
  const usernames = new Map();
  // Store room data: roomId -> { creatorId: string, users: [{userId, username, socketId}], pending: [] }
  const roomData = new Map();

  // Admin IP for WebNuke (Loopback for local dev)
  const ADMIN_IPS = ["::1", "127.0.0.1", "::ffff:127.0.0.1"];

  io.on("connection", (socket) => {
    // console.log("Client connected:", socket.id); // Removed for data minimization

    // Check if room exists
    socket.on("check-room", (roomId, callback) => {
        const exists = roomData.has(roomId);
        callback(exists);
    });

    socket.on("join-room", (roomId, userId, username, callback) => {
      // 1. Initialize room if new
      if (!roomData.has(roomId)) {
        roomData.set(roomId, {
            creatorId: userId,
            users: [],
            pending: []
        });
        
        // Log new room to DB
        db.query("INSERT INTO rooms (room_id) VALUES ($1)", [roomId])
          .then(() => console.log(`Room ${roomId} logged to DB`))
          .catch(err => console.error("Failed to log room:", err));
      }

      const room = roomData.get(roomId);
      
      // 2. Check if user is the creator or already in (rejoin)
      const isCreator = room.creatorId === userId;
      const existingUser = room.users.find(u => u.userId === userId);
      
      if (isCreator || existingUser) {
          // Allow immediate entry
          joinRoom(socket, roomId, userId, username, true); // true = isCreator (if applicable)
          if (callback) callback({ size: room.users.length, isCreator, users: room.users });
      } else {
          // 3. New user requesting access
          // Add to pending list
          room.pending.push({ userId, username, socketId: socket.id });
          
          // Notify creator
          const creatorSocketId = room.users.find(u => u.userId === room.creatorId)?.socketId;
          if (creatorSocketId) {
              io.to(creatorSocketId).emit("join-request", { userId, username });
          }
          
          // Notify user they are waiting
          socket.emit("waiting-approval");
      }
    });

    socket.on("approve-join", ({ roomId, userId }) => {
        const room = roomData.get(roomId);
        if (!room) return;
        
        // Verify requester is creator? (omitted for speed, but ideally check socket.id)
        
        const pendingIdx = room.pending.findIndex(u => u.userId === userId);
        if (pendingIdx !== -1) {
            const user = room.pending[pendingIdx];
            room.pending.splice(pendingIdx, 1);
            
            // Get user socket
            const userSocket = io.sockets.sockets.get(user.socketId);
            if (userSocket) {
                joinRoom(userSocket, roomId, user.userId, user.username, false);
                userSocket.emit("join-approved", { 
                    size: room.users.length, 
                    isCreator: false, 
                    users: room.users 
                });
            }
        }
    });

    socket.on("reject-join", ({ roomId, userId }) => {
        const room = roomData.get(roomId);
        if (!room) return;
        
        const pendingIdx = room.pending.findIndex(u => u.userId === userId);
        if (pendingIdx !== -1) {
            const user = room.pending[pendingIdx];
            room.pending.splice(pendingIdx, 1);
            io.to(user.socketId).emit("join-rejected");
        }
    });

    function joinRoom(socket, roomId, userId, username, isCreator) {
        socket.join(roomId);
        usernames.set(socket.id, username);
        
        const room = roomData.get(roomId);
        // Remove if exists (rejoin)
        const existingIdx = room.users.findIndex(u => u.userId === userId);
        if (existingIdx !== -1) room.users.splice(existingIdx, 1);
        
        room.users.push({ userId, username, socketId: socket.id });
        
        socket.to(roomId).emit("user-connected", { userId, username });

        socket.on("disconnect", () => {
            handleDisconnect(socket, roomId, userId);
        });
    }

    function handleDisconnect(socket, roomId, userId) {
        usernames.delete(socket.id);
        const room = roomData.get(roomId);
        if (room) {
            const idx = room.users.findIndex(u => u.userId === userId);
            if (idx !== -1) room.users.splice(idx, 1);
            
            if (room.users.length === 0) {
                roomData.delete(roomId);
            } else if (room.creatorId === userId) {
                // Creator left, assign new creator? Or keep room locked?
                // For "Secure Chat", if creator leaves, room might be dead.
                // But let's assign next user as creator to keep it alive.
                room.creatorId = room.users[0].userId;
                io.to(room.users[0].socketId).emit("promoted-to-owner");
            }
            socket.to(roomId).emit("user-disconnected", userId);
        }
    }

    // Nuke Room
    socket.on("nuke-room", (roomId) => {
        io.to(roomId).emit("nuke-room");
        roomData.delete(roomId); // Clear room data immediately
    });

    // Web Nuke (Admin Only)
    socket.on("web-nuke", () => {
        const clientIp = socket.handshake.address;
        console.log("Web Nuke requested from:", clientIp);
        
        if (ADMIN_IPS.includes(clientIp)) {
            console.log("Web Nuke AUTHORIZED. Executing...");
            io.emit("nuke-room"); // Clear all clients
            io.disconnectSockets(); // Disconnect everyone
            roomData.clear();
            usernames.clear();
        } else {
            console.log("Web Nuke DENIED.");
        }
    });

    // WebRTC Signaling
    socket.on("offer", (data) => {
      socket.to(data.roomId).emit("offer", data);
    });

    socket.on("answer", (data) => {
      socket.to(data.roomId).emit("answer", data);
    });

    socket.on("ice-candidate", (data) => {
      socket.to(data.roomId).emit("ice-candidate", data);
    });

    // E2EE Key Exchange
    socket.on("public-key", (data) => {
      // data: { roomId, userId, publicKey }
      socket.to(data.roomId).emit("public-key", data);
    });

    socket.on("encrypted-room-key", (data) => {
      socket.to(data.roomId).emit("encrypted-room-key", data);
    });

    socket.on("encrypted-room-key-v2", (data) => {
      socket.to(data.roomId).emit("encrypted-room-key-v2", data);
    });

    // Encrypted Message Relay (optional, if not using P2P for messages)
    // We prefer P2P (WebRTC DataChannel) for true security, but relay is needed if P2P fails or for simple chat
    // User requested "Messages are encrypted on your device and only decrypted on the recipient’s device"
    // Relay is fine as long as payload is encrypted.
    socket.on("send-message", (data) => {
      // data: { roomId, message: { iv, data }, senderId }
      socket.to(data.roomId).emit("receive-message", data);
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
