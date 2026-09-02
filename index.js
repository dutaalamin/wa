const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { sendWhatsAppMessage } = require('./services/fonnte');
const { initScheduler, checkAndSendReminders, getMeetings, saveMeetings } = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper Parsing Jam & Tanggal secara Fleksibel & Alami
function parseNaturalMeeting(message) {
  const timeRegex = /(?:jam\s*(\d{1,2})(?::(\d{2}))?)|(?:(\d{1,2})[.:](\d{2}))/i;
  const match = message.match(timeRegex);

  let hour = 14;
  let minute = 0;
  let hasTime = false;

  if (match) {
    hasTime = true;
    if (match[1] !== undefined) {
      hour = parseInt(match[1]);
      minute = match[2] ? parseInt(match[2]) : 0;
    } else if (match[3] !== undefined) {
      hour = parseInt(match[3]);
      minute = parseInt(match[4]);
    }
  }

  if (hour < 7) hour += 12;

  const now = new Date();
  let targetDate = new Date();

  if (message.toLowerCase().includes('besok')) {
    targetDate.setDate(now.getDate() + 1);
  }

  targetDate.setHours(hour, minute, 0, 0);

  if (targetDate <= now && !message.toLowerCase().includes('besok')) {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  const hh = String(targetDate.getHours()).padStart(2, '0');
  const min = String(targetDate.getMinutes()).padStart(2, '0');

  const formattedTimeStr = `${yyyy}-${mm}-${dd} ${hh}:${min}`;

  let cleanedName = message
    .replace(/^(meeting|jadwal|remind|ingatkan|buat|catat)\s*/i, '')
    .replace(/(besok|hari ini|jam\s*\d+(?::\d+)?|\d{1,2}[.:]\d{2})/gi, '')
    .trim();

  if (!cleanedName) cleanedName = 'Client';

  return {
    clientName: cleanedName,
    meetingTitle: `Meeting ${cleanedName}`,
    meetingTime: formattedTimeStr,
    displayDate: targetDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    displayTime: `${hh}:${min}`,
    hasTime,
  };
}

// 1. Endpoint Utama: Melayani HTML Dashboard Interaktif
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 2. Endpoint Cek Server JSON
app.get('/api/health', (req, res) => {
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

// 3. Endpoint Vercel Cron Job
app.get('/api/cron', async (req, res) => {
  const result = await checkAndSendReminders();
  res.json({ success: true, message: 'Vercel Cron Triggered', data: result });
});

// 4. Endpoint Mengambil Seluruh Jadwal Meeting
app.get('/api/meetings', (req, res) => {
  const meetings = getMeetings();
  res.json({ success: true, data: meetings });
});

// 5. Endpoint Menambah Jadwal Meeting Baru (via Web Dashboard)
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

// 6. Endpoint Tes Kirim Pesan WA Langsung
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

// 7. Endpoint Webhook Fonnte (Mendukung GET & POST dari Fonnte)
app.all('/api/webhook', async (req, res) => {
  console.log('📥 [Webhook Incoming Hit]: Method=', req.method, 'Body=', req.body, 'Query=', req.query);

  const payload = req.method === 'POST' ? req.body : req.query;
  const sender = payload.sender || payload.from || payload.phone;
  const message = payload.message || payload.text || payload.body;

  // Balas respons HTTP ke Fonnte secepat mungkin agar Fonnte tahu Webhook Sukses!
  res.status(200).send('OK');

  if (sender && message && typeof message === 'string') {
    try {
      const parsed = parseNaturalMeeting(message);

      const meetings = getMeetings();
      const newMeeting = {
        id: Date.now(),
        clientName: parsed.clientName,
        phone: sender,
        meetingTitle: parsed.meetingTitle,
        meetingTime: parsed.meetingTime,
        reminderMinutesBefore: 60,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      meetings.push(newMeeting);
      saveMeetings(meetings);

      console.log('📌 [Jadwal Baru via Chat WA Alami]:', newMeeting);

      const replyMsg = `✅ *Siap! Pengingat Meeting Berhasil Dicatat!*\n\n` +
        `👤 *Nama*: ${parsed.clientName}\n` +
        `📅 *Hari/Tanggal*: ${parsed.displayDate}\n` +
        `⏰ *Waktu*: ${parsed.displayTime} WIB\n\n` +
        `Bot akan otomatis mengirimkan pesan pengingat WA sebelum meeting dimulai. Terima kasih! 🙏`;

      await sendWhatsAppMessage(sender, replyMsg);
    } catch (err) {
      console.error('❌ Gagal memproses Webhook chat:', err);
    }
  }
});

// Start Local Server jika dijalankan secara lokal
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🟢 WA Reminder Bot Server aktif di http://localhost:${PORT}`);
    console.log(`==================================================`);
    initScheduler();
  });
}

module.exports = app;
