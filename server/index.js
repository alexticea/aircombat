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
    username: { type: String, required: true, unique: true },
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
    const { username, wins, kills } = req.body;
    try {
        const pilot = await Pilot.findOneAndUpdate(
            { username },
            {
                $set: { wins, kills, updatedAt: new Date() }
            },
            { upsert: true, new: true }
        );
        res.json(pilot);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update score' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
