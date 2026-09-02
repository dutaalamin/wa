const axios = require('axios');
const https = require('https');
require('dotenv').config();

// Agent HTTPS untuk melewati kendala SSL Self-Signed Certificate di Windows
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

/**
 * Kirim pesan WhatsApp menggunakan Fonnte API
 * @param {string} target - Nomor WA tujuan (misal: "08123456789")
 * @param {string} message - Isi pesan teks
 */
async function sendWhatsAppMessage(target, message) {
  const token = process.env.FONNTE_TOKEN;

  if (!token || token === 'YOUR_FONNTE_TOKEN_HERE') {
    console.error('❌ [Fonnte Error]: Token Fonnte belum diisi di file .env!');
    return { status: false, detail: 'Token Fonnte belum diisi di file .env' };
  }

  try {
    const response = await axios.post(
      'https://api.fonnte.com/send',
      {
        target: target,
        message: message,
        countryCode: '62',
      },
      {
        headers: {
          Authorization: token,
        },
        httpsAgent: httpsAgent,
      }
    );

    console.log(`✅ [Fonnte Success] Pesan terkirim ke ${target}:`, response.data);
    return response.data;
  } catch (error) {
    const errorDetail = error.response?.data || error.message;
    console.error(`❌ [Fonnte Error] Gagal kirim ke ${target}:`, errorDetail);
    return { status: false, detail: typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : errorDetail };
  }
}

module.exports = { sendWhatsAppMessage };
