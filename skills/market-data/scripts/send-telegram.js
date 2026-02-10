#!/usr/bin/env node
// Send a message via the Finance Bot Telegram API
// Usage: echo "message text" | node send-telegram.js
//    or: node send-telegram.js "message text"
//    or: node send-telegram.js --file results.json
//
// Env: FINANCE_BOT_TOKEN, FINANCE_CHAT_ID

const TOKEN = process.env.FINANCE_BOT_TOKEN;
const CHAT_ID = process.env.FINANCE_CHAT_ID;

if (!TOKEN || !CHAT_ID) {
  console.error(JSON.stringify({ error: 'FINANCE_BOT_TOKEN and FINANCE_CHAT_ID must be set' }));
  process.exit(1);
}

async function sendMessage(text) {
  // Telegram max message length is 4096 chars
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) {
    chunks.push(text.slice(i, i + 4000));
  }

  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: chunk,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      // Retry without Markdown if parse fails
      if (err.includes("can't parse")) {
        await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: CHAT_ID,
            text: chunk,
            disable_web_page_preview: true,
          }),
        });
      } else {
        throw new Error(`Telegram API error: ${err}`);
      }
    }
  }
}

async function main() {
  let text;

  if (process.argv[2] === '--file') {
    const fs = require('fs');
    text = fs.readFileSync(process.argv[3], 'utf8');
  } else if (process.argv[2]) {
    text = process.argv.slice(2).join(' ');
  } else {
    // Read from stdin
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    text = Buffer.concat(chunks).toString('utf8');
  }

  if (!text || !text.trim()) {
    console.error(JSON.stringify({ error: 'No message text provided' }));
    process.exit(1);
  }

  await sendMessage(text.trim());
  console.log(JSON.stringify({ success: true, chatId: CHAT_ID, length: text.length }));
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
