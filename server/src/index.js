import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { RoomManager } from "./RoomManager.js";
import { PHASES } from "./constants.js";

const PORT = process.env.PORT || 4000;

// Lock this down to your deployed client's exact origin(s) once you have
// them. Set the CORS_ORIGINS env var on your server host (comma-separated
// for multiple, e.g. your Netlify URL + a custom domain). Falls back to "*"
// (allow anything) only when the env var isn't set, so local dev keeps
// working out of the box — don't ship to a real event without setting this.
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
  : "*";

const app = express();
app.use(cors({ origin: allowedOrigins }));
app.get("/health", (_req, res) => res.json({ ok: true, name: "THE ROT server" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins },
});

const roomManager = new RoomManager(io);

// ---------------------------------------------------------------------
// Basic abuse protection — none of this existed while this was just a
// private link shared with friends, but it matters the moment this is a
// public Play Store app anyone can open. None of it needs a database or
// external package; it's just in-memory counters, reset on server restart.
// ---------------------------------------------------------------------

// Caps total concurrent rooms so one bad actor (or a genuine traffic spike)
// can't grow server memory without bound. Configurable via env var so this
// can be tuned to whatever the actual host's resources support.
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 300;

// Per-IP room-creation limit: prevents one person from scripting endless
// "host:createRoom" calls. Window and cap are deliberately generous — a
// real host might restart a room a few times setting up a party — this is
// only meant to stop obvious automated abuse, not annoy real hosts.
const ROOM_CREATE_WINDOW_MS = 10 * 60 * 1000;
const ROOM_CREATE_MAX_PER_WINDOW = 8;
const roomCreateAttempts = new Map(); // ip -> [timestamps]

function isRateLimited(map, key, windowMs, max) {
  const now = Date.now();
  const timestamps = (map.get(key) || []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  map.set(key, timestamps);
  return timestamps.length > max;
}

// Chat flood guard: the 240-char cap in Room.handleChatMessage stops giant
// single messages, but says nothing about rapid-fire spam. One message per
// 1.2s per player is well within normal typing speed but blocks a scripted
// flood.
const CHAT_MIN_INTERVAL_MS = 1200;
const lastChatAt = new Map(); // socketId -> timestamp

// Clean up stale rate-limit entries periodically so these Maps don't grow
// forever across a long-running server process.
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of roomCreateAttempts) {
    const fresh = timestamps.filter((t) => now - t < ROOM_CREATE_WINDOW_MS);
    if (fresh.length === 0) roomCreateAttempts.delete(ip);
    else roomCreateAttempts.set(ip, fresh);
  }
}, 5 * 60 * 1000);

function safe(socket, fn) {
  try {
    fn();
  } catch (err) {
    socket.emit("error:action", { message: err.message || "Something went wrong." });
  }
}

io.on("connection", (socket) => {
  // ---- Host flow -------------------------------------------------------
  socket.on("host:createRoom", (config, ack) => {
    safe(socket, () => {
      const ip = socket.handshake.address;
      if (isRateLimited(roomCreateAttempts, ip, ROOM_CREATE_WINDOW_MS, ROOM_CREATE_MAX_PER_WINDOW)) {
        return ack?.({ ok: false, reason: "Too many rooms created recently — please wait a bit and try again." });
      }
      if (roomManager.rooms.size >= MAX_ROOMS) {
        return ack?.({ ok: false, reason: "Server is at capacity right now — please try again shortly." });
      }
      const room = roomManager.createRoom(socket.id, config);
      socket.join(room.roomKey);
      socket.join(`${room.roomKey}:host`);
      socket.data.isHost = true;
      socket.data.roomCode = room.code;
      ack?.({
        ok: true,
        code: room.code,
        config: room.config,
        hostReconnectToken: room.hostReconnectToken,
      });
      room.broadcastLobbyState();
    });
  });

  socket.on("host:reconnect", ({ code, hostReconnectToken }, ack) => {
    safe(socket, () => {
      const room = roomManager.getRoom(code);
      if (!room) throw new Error("Room not found.");
      room.reconnectHost(socket, hostReconnectToken);
      socket.data.isHost = true;
      socket.data.roomCode = room.code;
      ack?.({
        ok: true,
        code: room.code,
        config: room.config,
        phase: room.phase,
        round: room.round,
        powerOn: room.powerOn,
      });
    });
  });

  socket.on("host:startGame", (_payload, ack) => {
    safe(socket, () => {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room || room.hostSocketId !== socket.id) throw new Error("Not authorized.");
      room.startGame();
      ack?.({ ok: true });
    });
  });

  socket.on("host:requestRoles", (_payload, ack) => {
    safe(socket, () => {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room || room.hostSocketId !== socket.id) throw new Error("Not authorized.");
      room.broadcastHostRoles();
      ack?.({ ok: true });
    });
  });

  socket.on("host:endRoom", (_payload, ack) => {
    safe(socket, () => {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room || room.hostSocketId !== socket.id) throw new Error("Not authorized.");
      room.clearAllTimers();
      io.to(room.roomKey).emit("room:ended");
      roomManager.removeRoom(room.code);
      ack?.({ ok: true });
    });
  });

  socket.on("host:skipDiscussion", (_payload, ack) => {
    safe(socket, () => {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room || room.hostSocketId !== socket.id) throw new Error("Not authorized.");
      ack?.(room.handleSkipDiscussion());
    });
  });

  // ---- Player flow -------------------------------------------------------
  socket.on("player:joinRoom", ({ code, displayName, color }, ack) => {
    safe(socket, () => {
      const room = roomManager.getRoom(code);
      if (!room) throw new Error("Room not found.");
      const player = room.addPlayer(socket, (displayName || "").trim().slice(0, 20), color);
      socket.data.roomCode = room.code;
      socket.data.playerId = player.playerId;
      ack?.({
        ok: true,
        playerId: player.playerId,
        reconnectToken: player.reconnectToken,
        code: room.code,
        config: room.config,
        color: player.color,
      });
    });
  });

  socket.on("player:reconnect", ({ code, reconnectToken }, ack) => {
    safe(socket, () => {
      const room = roomManager.getRoom(code);
      if (!room) throw new Error("Room not found.");
      const player = room.reconnectPlayer(socket, reconnectToken);
      socket.data.roomCode = room.code;
      socket.data.playerId = player.playerId;

      ack?.({
        ok: true,
        playerId: player.playerId,
        phase: room.phase,
        round: room.round,
        powerOn: room.powerOn,
        alive: player.alive,
        isOC: player.isOC,
        isCorrupted: player.isCorrupted,
        cards: player.cards,
        color: player.color,
        x: player.x,
        z: player.z,
        deadline: room.phaseDeadline,
      });
      room.broadcastLobbyState();
      room.broadcastPublicPlayerSummary();
      room.broadcastPositions();
    });
  });

  socket.on("player:move", ({ x, z }) => {
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room || !socket.data.playerId) return;
    room.handleMove(socket.data.playerId, Number(x) || 0, Number(z) || 0);
  });

  socket.on("player:restorePower", (_payload, ack) => {
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room || !socket.data.playerId) return ack?.({ ok: false, reason: "No room." });
    ack?.(room.handleRestorePower(socket.data.playerId));
  });

  socket.on("player:stealCard", ({ targetId }, ack) => {
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room || !socket.data.playerId) return ack?.({ ok: false, reason: "No room." });
    ack?.(room.handleStealCard(socket.data.playerId, targetId));
  });

  socket.on("player:corruptionChoice", ({ becomeCorrupted }, ack) => {
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room || !socket.data.playerId) return ack?.({ ok: false, reason: "No room." });
    ack?.(room.handleCorruptionChoice(socket.data.playerId, !!becomeCorrupted));
  });

  socket.on("player:callMeeting", (_payload, ack) => {
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room || !socket.data.playerId) return ack?.({ ok: false, reason: "No room." });
    ack?.(room.handleCallMeeting(socket.data.playerId));
  });

  socket.on("player:vote", ({ targetId }, ack) => {
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room || !socket.data.playerId) return ack?.({ ok: false, reason: "No room." });
    ack?.(room.handleVote(socket.data.playerId, targetId));
  });

  socket.on("player:chatMessage", ({ text }, ack) => {
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room || !socket.data.playerId) return ack?.({ ok: false, reason: "No room." });
    const last = lastChatAt.get(socket.id) || 0;
    if (Date.now() - last < CHAT_MIN_INTERVAL_MS) {
      return ack?.({ ok: false, reason: "You're sending messages too fast." });
    }
    lastChatAt.set(socket.id, Date.now());
    ack?.(room.handleChatMessage(socket.data.playerId, text));
  });

  // ---- Disconnect -------------------------------------------------------
  socket.on("disconnect", () => {
    lastChatAt.delete(socket.id);
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room) return;
    room.handleSocketDisconnect(socket.id);

    // Clean up empty lobbies (nobody connected, still in LOBBY) after a delay.
    if (room.phase === PHASES.LOBBY) {
      const anyoneConnected =
        room.playerList().some((p) => p.connected) || io.sockets.sockets.has(room.hostSocketId);
      if (!anyoneConnected) {
        setTimeout(() => {
          const stillThere = roomManager.getRoom(room.code);
          if (stillThere && stillThere.phase === PHASES.LOBBY) {
            const stillEmpty =
              !stillThere.playerList().some((p) => p.connected) &&
              !io.sockets.sockets.has(stillThere.hostSocketId);
            if (stillEmpty) roomManager.removeRoom(room.code);
          }
        }, 60_000);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`THE ROT server listening on port ${PORT}`);
});
