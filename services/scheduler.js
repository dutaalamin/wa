const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { sendWhatsAppMessage } = require('./fonnte');

const meetingsPath = path.join(__dirname, '../data/meetings.json');

// Helper membaca data meetings dari JSON
function getMeetings() {
  try {
    if (!fs.existsSync(meetingsPath)) return [];
    const data = fs.readFileSync(meetingsPath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Gagal membaca data/meetings.json:', err);
    return [];
  }
}

// Helper menyimpan data meetings ke JSON
function saveMeetings(meetings) {
  try {
    fs.writeFileSync(meetingsPath, JSON.stringify(meetings, null, 2), 'utf8');
  } catch (err) {
    console.error('Gagal menyimpan data/meetings.json:', err);
  }
}

// Inisialisasi Cron Job (Jalan Setiap 1 Menit)
function initScheduler() {
  console.log('⏰ [Scheduler] Node-cron scheduler diaktifkan (memeriksa jadwal setiap menit)...');

  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const meetings = getMeetings();
    let hasChanges = false;

    for (let meeting of meetings) {
      if (meeting.status !== 'pending') continue;

      const meetingDate = new Date(meeting.meetingTime);
      const reminderTime = new Date(meetingDate.getTime() - (meeting.reminderMinutesBefore || 60) * 60 * 1000);

      // Jika waktu sekarang >= waktu reminder && waktu sekarang < waktu meeting
      if (now >= reminderTime && now < meetingDate) {
        console.log(`🚀 [Reminder Triggered] Mengirim pengingat meeting ke ${meeting.clientName} (${meeting.phone})...`);

        const formattedDate = meetingDate.toLocaleDateString('id-ID', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        const formattedTime = meetingDate.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        });

        const message = `Halo ${meeting.clientName}! 👋\n\n` +
          `Ini adalah pengingat otomatis untuk agenda meeting Anda:\n` +
          `📌 *Topik*: ${meeting.meetingTitle}\n` +
          `📅 *Hari/Tanggal*: ${formattedDate}\n` +
          `⏰ *Waktu*: ${formattedTime} WIB\n\n` +
          `Mohon untuk bersiap-siap. Sampai jumpa di lokasi/link meeting! Terima kasih. 🙏`;

        const res = await sendWhatsAppMessage(meeting.phone, message);

        if (res && res.status) {
          meeting.status = 'sent';
          meeting.sentAt = new Date().toISOString();
          hasChanges = true;
        } else {
          console.log(`⚠️ Gagal mengirim pesan ke ${meeting.clientName}, akan dicoba kembali menit berikutnya.`);
        }
      }
    }

    if (hasChanges) {
      saveMeetings(meetings);
    }
  });
}

module.exports = { initScheduler, getMeetings, saveMeetings };
