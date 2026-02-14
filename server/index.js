const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/aircombat';

mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

const PilotSchema = new mongoose.Schema({
    username: { type: String, required: true },
    walletAddress: { type: String, unique: true, sparse: true },
    wins: { type: Number, default: 0 },
    kills: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now }
});

const Pilot = mongoose.model('Pilot', PilotSchema);

// GET Leaderboard
app.get('/leaderboard', async (req, res) => {
    try {
        const topAces = await Pilot.find()
            .sort({ wins: -1, kills: -1 })
            .limit(10);
        res.json(topAces);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

// POST Update Score
app.post('/update-score', async (req, res) => {
    const { username, wins, kills, walletAddress } = req.body;

    try {
        let pilot;

        if (walletAddress) {
            // If wallet is connected, find by walletAddress
            pilot = await Pilot.findOne({ walletAddress });

            if (pilot) {
                // Update existing wallet user (rename and update stats)
                pilot.username = username;
                pilot.wins = wins;
                pilot.kills = kills;
                pilot.updatedAt = new Date();
                await pilot.save();
            } else {
                // Create new wallet user
                pilot = new Pilot({ username, walletAddress, wins, kills });
                await pilot.save();
            }
        } else {
            // Guest mode: find/create by username
            pilot = await Pilot.findOneAndUpdate(
                { username },
                {
                    $set: { wins, kills, updatedAt: new Date() }
                },
                { upsert: true, new: true }
            );
        }

        res.json(pilot);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update score' });
    }
});

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let matchmakingQueue = [];
let activeGames = {}; // roomId -> { p1: socketId, p2: socketId, p1Ready: bool, p2Ready: bool }

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_matchmaking', ({ username, walletAddress }) => {
        // If already in queue, ignore
        if (matchmakingQueue.find(p => p.id === socket.id)) return;

        console.log(`User ${username} joined matchmaking`);

        if (matchmakingQueue.length > 0) {
            // Match found!
            const opponent = matchmakingQueue.shift();
            const roomId = `room_${opponent.id}_${socket.id}`;

            socket.join(roomId);
            io.sockets.sockets.get(opponent.id)?.join(roomId);

            activeGames[roomId] = {
                p1: opponent.id,
                p2: socket.id,
                p1Ready: false,
                p2Ready: false,
                p1Data: opponent.userData,
                p2Data: { username, walletAddress }
            };

            // Notify players
            io.to(opponent.id).emit('match_found', {
                roomId,
                role: 'P1',
                opponent: { username, walletAddress }
            });

            socket.emit('match_found', {
                roomId,
                role: 'P2',
                opponent: opponent.userData
            });

            console.log(`Match started: ${roomId}`);
        } else {
            // Wait in queue
            matchmakingQueue.push({
                id: socket.id,
                userData: { username, walletAddress }
            });
            socket.emit('waiting_for_match');
        }
    });

    socket.on('place_fleet', ({ roomId, planes }) => {
        const game = activeGames[roomId];
        if (!game) return;

        if (socket.id === game.p1) game.p1Ready = true;
        if (socket.id === game.p2) game.p2Ready = true;

        if (game.p1Ready && game.p2Ready) {
            io.to(roomId).emit('battle_start', { firstTurn: game.p1 });
        }
    });

    socket.on('fire_shot', ({ roomId, coordinate }) => {
        socket.to(roomId).emit('incoming_fire', coordinate);
    });

    socket.on('shot_result', ({ roomId, Coordinate, result, isKill }) => {
        // Coordinate: {x,y}, result: 'HIT'|'MISS'
        socket.to(roomId).emit('shot_feedback', { Coordinate, result, isKill });
    });

    socket.on('game_over', ({ roomId, winnerId }) => {
        // Log stats to DB if needed
        // For now just relay
    });

    socket.on('play_again', ({ roomId }) => {
        // Simple rematch logic or kick to lobby
        socket.to(roomId).emit('opponent_play_again');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Remove from queue
        matchmakingQueue = matchmakingQueue.filter(p => p.id !== socket.id);

        // Notify opponent in active games
        for (const roomId in activeGames) {
            const game = activeGames[roomId];
            if (game.p1 === socket.id || game.p2 === socket.id) {
                const opponentId = game.p1 === socket.id ? game.p2 : game.p1;
                io.to(opponentId).emit('opponent_disconnected');
                delete activeGames[roomId];
                console.log(`Game ${roomId} ended due to disconnect`);
                break;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
