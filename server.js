
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
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  const io = new Server(httpServer);
  
  // Store usernames: socketId -> username
  const usernames = new Map();
  // Store user info per room: roomId -> [{userId, username}]
  const roomUsers = new Map();

  // Admin IP for WebNuke (Loopback for local dev)
  const ADMIN_IPS = ["::1", "127.0.0.1", "::ffff:127.0.0.1"];

  io.on("connection", (socket) => {
    // console.log("Client connected:", socket.id); // Removed for data minimization

    socket.on("join-room", (roomId, userId, username, callback) => {
      socket.join(roomId);
      usernames.set(socket.id, username);
      
      if (!roomUsers.has(roomId)) {
        roomUsers.set(roomId, []);
      }
      const users = roomUsers.get(roomId);
      // Remove if exists (rejoin)
      const existingIdx = users.findIndex(u => u.userId === userId);
      if (existingIdx !== -1) users.splice(existingIdx, 1);
      
      users.push({ userId, username });
      
      const room = io.sockets.adapter.rooms.get(roomId);
      const size = room ? room.size : 0;
      
      // Send acknowledgement with room info and current users
      if (callback) {
        const isCreator = size === 1;
        
        if (isCreator) {
            // Log new room to Neon DB
            db.query("INSERT INTO rooms (room_id) VALUES ($1)", [roomId])
              .then(() => console.log(`Room ${roomId} logged to DB`))
              .catch(err => console.error("Failed to log room:", err));
        }

        callback({ 
          size, 
          isCreator,
          users: users 
        });
      }

      socket.to(roomId).emit("user-connected", { userId, username });

      socket.on("disconnect", () => {
        usernames.delete(socket.id);
        const currentUsers = roomUsers.get(roomId);
        if (currentUsers) {
            const idx = currentUsers.findIndex(u => u.userId === userId);
            if (idx !== -1) currentUsers.splice(idx, 1);
            if (currentUsers.length === 0) roomUsers.delete(roomId);
        }
        socket.to(roomId).emit("user-disconnected", userId);
      });
    });

    // Nuke Room
    socket.on("nuke-room", (roomId) => {
        io.to(roomId).emit("nuke-room");
        roomUsers.delete(roomId); // Clear room data immediately
    });

    // Web Nuke (Admin Only)
    socket.on("web-nuke", () => {
        const clientIp = socket.handshake.address;
        console.log("Web Nuke requested from:", clientIp);
        
        if (ADMIN_IPS.includes(clientIp)) {
            console.log("Web Nuke AUTHORIZED. Executing...");
            io.emit("nuke-room"); // Clear all clients
            io.disconnectSockets(); // Disconnect everyone
            roomUsers.clear();
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
