const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { sendWhatsAppMessage } = require('./services/fonnte');
const { initScheduler, checkAndSendReminders, getMeetings, saveMeetings } = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 1. Endpoint Utama / Cek Server
app.get('/', (req, res) => {
  res.json({
    message: '🚀 WhatsApp Meeting Reminder Bot Server Online!',
    endpoints: {
      getMeetings: 'GET /api/meetings',
      addMeeting: 'POST /api/meetings',
      sendTestWA: 'POST /api/send-test',
      vercelCron: 'GET /api/cron',
    },
  });
});

// 2. Endpoint Vercel Cron Job (Jalan otomatis di Vercel cloud tiap menit)
app.get('/api/cron', async (req, res) => {
  const result = await checkAndSendReminders();
  res.json({ success: true, message: 'Vercel Cron Triggered', data: result });
});

// 3. Endpoint Mengambil Seluruh Jadwal Meeting
app.get('/api/meetings', (req, res) => {
  const meetings = getMeetings();
  res.json({ success: true, data: meetings });
});

// 4. Endpoint Menambah Jadwal Meeting Baru
app.post('/api/meetings', (req, res) => {
  const { clientName, phone, meetingTitle, meetingTime, reminderMinutesBefore } = req.body;

  if (!clientName || !phone || !meetingTitle || !meetingTime) {
    return res.status(400).json({
      success: false,
      message: 'Field clientName, phone, meetingTitle, dan meetingTime wajib diisi!',
    });
  }

  const meetings = getMeetings();
  const newMeeting = {
    id: Date.now(),
    clientName,
    phone,
    meetingTitle,
    meetingTime,
    reminderMinutesBefore: parseInt(reminderMinutesBefore) || 60,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  meetings.push(newMeeting);
  saveMeetings(meetings);

  console.log('📌 [New Meeting Added]:', newMeeting);
  res.json({ success: true, message: 'Jadwal meeting berhasil ditambahkan!', data: newMeeting });
});

// 5. Endpoint Tes Kirim Pesan WA Langsung
app.post('/api/send-test', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({
      success: false,
      message: 'Field phone dan message wajib diisi!',
    });
  }

  const result = await sendWhatsAppMessage(phone, message);
  res.json({ success: true, result });
});

// 6. Endpoint Webhook Fonnte (Input Jadwal via Chat WA Langsung!)
app.post('/api/webhook', async (req, res) => {
  const { sender, message } = req.body;

  if (message && message.toLowerCase().startsWith('#jadwal')) {
    const content = message.substring(7).trim();
    const parts = content.split('|').map((p) => p.trim());

    if (parts.length >= 3) {
      const [clientName, meetingTitle, meetingTime] = parts;

      const meetings = getMeetings();
      const newMeeting = {
        id: Date.now(),
        clientName,
        phone: sender,
        meetingTitle,
        meetingTime,
        reminderMinutesBefore: 60,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      meetings.push(newMeeting);
      saveMeetings(meetings);

      console.log('📌 [Jadwal Baru via Chat WA]:', newMeeting);

      const replyMsg = `✅ *Jadwal Meeting Berhasil Dibuat!*\n\n` +
        `👤 *Client*: ${clientName}\n` +
        `📌 *Topik*: ${meetingTitle}\n` +
        `⏰ *Waktu*: ${meetingTime} WIB\n\n` +
        `Pengingat otomatis akan dikirimkan H-1 jam sebelum meeting dimulai. Terima kasih! 🙏`;

      await sendWhatsAppMessage(sender, replyMsg);
    } else {
      const errorReply = `⚠️ *Format Pembuatan Jadwal Salah!*\n\n` +
        `Gunakan format berikut:\n` +
        `\`#jadwal Nama Client | Topik Meeting | YYYY-MM-DD HH:mm\`\n\n` +
        `*Contoh*:\n` +
        `\`#jadwal Pak Budi | Diskusi UI | 2026-09-03 14:00\``;

      await sendWhatsAppMessage(sender, errorReply);
    }
  }

  res.json({ status: true });
});

// Start Local Server jika dijalankan secara lokal (bukan Vercel Serverless)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🟢 WA Reminder Bot Server aktif di http://localhost:${PORT}`);
    console.log(`==================================================`);
    initScheduler();
  });
}

module.exports = app;
