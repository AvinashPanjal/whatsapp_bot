import express from 'express';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import dotenv from 'dotenv';
import { askGemini } from './gemini.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// State management for QR and Bot Status
let currentQr = null;
let botStatus = 'Initializing...';
let qrImageSrc = null;

// Express Server Dashboard for health checks and scanning QR code
app.get('/', (req, res) => {
  const isConnected = botStatus === 'Ready & Connected';
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WhatsApp Gemini Bot Status</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background-color: #f0f2f5; color: #111b21; }
        .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; max-width: 440px; width: 90%; }
        h1 { margin-top: 0; color: #075e54; font-size: 1.6rem; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .status { margin: 1rem 0; padding: 0.6rem 1.2rem; border-radius: 20px; font-weight: 600; display: inline-block; }
        .status.connected { background: #dcf8c6; color: #075e54; }
        .status.waiting { background: #fff3cd; color: #856404; }
        .status.error { background: #f8d7da; color: #721c24; }
        .qr-container { margin-top: 1.5rem; background: #fafafa; padding: 1rem; border-radius: 8px; border: 1px solid #e0e0e0; }
        img { max-width: 250px; height: auto; border: 4px solid #075e54; border-radius: 8px; }
        .footer { margin-top: 1.5rem; font-size: 0.85rem; color: #667781; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🤖 WhatsApp Gemini Bot</h1>
        <div class="status ${isConnected ? 'connected' : 'waiting'}">
          Status: ${botStatus}
        </div>
        
        ${qrImageSrc ? `
          <div class="qr-container">
            <p><strong>Scan this QR code with WhatsApp:</strong></p>
            <img src="${qrImageSrc}" alt="WhatsApp QR Code" />
            <p style="font-size:0.8rem; color:#667; margin-top: 8px;">Open WhatsApp > Linked Devices > Link a Device</p>
          </div>
        ` : `
          <p style="margin-top: 1.5rem;">${isConnected ? '✅ Bot is active and replying to WhatsApp messages.' : '⏳ Generating QR Code, please wait standard initialization (10-30 seconds)...'}</p>
        `}

        <div class="footer">
          Powered by <code>whatsapp-web.js</code> & <code>Gemini 2.5 Flash</code>
        </div>
      </div>
      <script>
        ${!isConnected ? 'setTimeout(() => location.reload(), 10000);' : ''}
      </script>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    botStatus: botStatus,
    timestamp: new Date().toISOString()
  });
});

// Configure Puppeteer options for container environments with memory limits (Render 512MB RAM)
const puppeteerArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-breakpad',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-features=Translate,BackForwardCache,MediaRouter',
  '--disable-ipc-flooding-protection',
  '--disable-renderer-backgrounding',
  '--js-flags="--max-old-space-size=256"',
  '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
];

const puppeteerOptions = {
  headless: true,
  args: puppeteerArgs
};

if (process.env.PUPPETEER_EXECUTABLE_PATH) {
  puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
}

console.log('Initializing WhatsApp Web Client...');
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: puppeteerOptions
});

client.on('qr', async (qr) => {
  console.log('\n========================================');
  console.log('--- SCAN THIS QR CODE WITH WHATSAPP ---');
  qrcodeTerminal.generate(qr, { small: true });
  console.log('========================================\n');
  
  currentQr = qr;
  botStatus = 'Waiting for QR Code scan...';
  try {
    qrImageSrc = await QRCode.toDataURL(qr);
  } catch (err) {
    console.error('Failed to generate QR image:', err);
  }
});

client.on('ready', () => {
  console.log('🎉 WhatsApp Bot is Ready and Connected!');
  botStatus = 'Ready & Connected';
  currentQr = null;
  qrImageSrc = null;
});

client.on('authenticated', () => {
  console.log('🔑 WhatsApp Authentication successful!');
  botStatus = 'Authenticated. Starting session...';
});

client.on('auth_failure', (msg) => {
  console.error('❌ WhatsApp Auth Failure:', msg);
  botStatus = `Auth Failure: ${msg}`;
});

client.on('disconnected', (reason) => {
  console.log('⚠️ WhatsApp Client disconnected:', reason);
  botStatus = `Disconnected: ${reason}`;
});

// Common message handler for both incoming & self messages
async function handleIncomingMessage(msg, isSelf) {
  try {
    // Ignore status broadcast updates
    if (msg.isStatus || msg.from === 'status@broadcast') {
      return;
    }

    const allowSelf = process.env.ALLOW_SELF_MESSAGES !== 'false';
    if (isSelf && !allowSelf) {
      return;
    }

    const body = msg.body ? msg.body.trim() : '';
    if (!body) {
      return;
    }

    // Ignore bot's own AI output to prevent infinite loops
    if (isSelf && body.startsWith('🤖')) {
      return;
    }

    const prefix = process.env.BOT_PREFIX || '';
    if (prefix && !body.startsWith(prefix)) {
      return;
    }

    const userPrompt = prefix ? body.slice(prefix.length).trim() : body;
    if (!userPrompt) return;

    const chat = await msg.getChat();
    
    // Ignore group chats unless ALLOW_GROUPS=true or prefix is used
    if (chat.isGroup && !prefix && process.env.ALLOW_GROUPS !== 'true') {
      return;
    }

    console.log(`📩 RECEIVED [${isSelf ? 'Self Test' : msg.from}]: "${userPrompt}"`);

    // Show typing indicator in WhatsApp UI
    try {
      await chat.sendStateTyping();
    } catch (e) {
      // Ignore typing status errors if any
    }

    // Query Gemini AI
    const reply = await askGemini(userPrompt);

    // Format response with 🤖 indicator
    const formattedReply = `🤖 ${reply}`;

    // Send answer back to chat
    await msg.reply(formattedReply);
    console.log(`📤 REPLIED to [${msg.from}]`);
  } catch (err) {
    console.error('❌ Error in message handler:', err);
    try {
      await msg.reply(`🤖 ⚠️ Error processing message: ${err.message || 'Internal error'}`);
    } catch (sendErr) {
      console.error('Failed to send error reply:', sendErr);
    }
  }
}

// 1. Listen to incoming messages from OTHER users
client.on('message', async (msg) => {
  await handleIncomingMessage(msg, false);
});

// 2. Listen to outgoing messages from SELF (for testing from the logged-in phone)
client.on('message_create', async (msg) => {
  if (msg.fromMe) {
    await handleIncomingMessage(msg, true);
  }
});

// Start Express server binding explicitly to 0.0.0.0 for Render/Railway routing
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Server dashboard running on http://0.0.0.0:${PORT}`);
  console.log(`🤖 Starting WhatsApp client initialization...`);
  client.initialize().catch(err => {
    console.error('Failed to initialize WhatsApp client:', err);
    botStatus = `Initialization Error: ${err.message}`;
  });
});
