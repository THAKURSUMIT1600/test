const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
require('dotenv').config();
const { sessionMiddleware } = require('./config/session');

const PORT = process.env.PORT;

const app = express();

app.use(cookieParser());
app.use(
    express.urlencoded({
        extended: true,
    })
);
app.use(express.json());
app.set('trust proxy', 1);
app.use(
    cors({
        origin: 'http://localhost:3000',
        credentials: true,
    })
);
app.use(sessionMiddleware);

// Add health endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'MERN Ludo Backend',
    });
});

const server = app.listen(PORT);

require('./config/database')(mongoose);
require('./config/socket')(server);

// Start periodic room cleanup (every 10 minutes)
const { cleanupFinishedRooms } = require('./services/roomService');
setInterval(async () => {
    await cleanupFinishedRooms();
}, 10 * 60 * 1000); // 10 minutes

console.log(`🎮 MERN Ludo Server running on port ${PORT}`);

if (process.env.NODE_ENV === 'production') {
    app.use(express.static('./build'));
    app.get('*', (req, res) => {
        const indexPath = path.join(__dirname, './build/index.html');
        res.sendFile(indexPath);
    });
}

module.exports = { server };
