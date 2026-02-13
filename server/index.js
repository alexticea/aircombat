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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
