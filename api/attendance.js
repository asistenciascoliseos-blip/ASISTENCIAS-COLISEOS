const { Buffer } = require('node:buffer');

function sendJson(response, status, body) {
    response.status(status).setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(body));
}

module.exports = async function attendance(request, response) {
    if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        return sendJson(response, 405, { error: 'Método no permitido' });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
        return sendJson(response, 500, { error: 'Telegram no está configurado en el servidor' });
    }

    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    const { photo, user, movement, date } = body || {};
    if (!photo || !user?.name || !user?.id || !movement || !date) {
        return sendJson(response, 400, { error: 'Faltan datos de la asistencia' });
    }

    const match = photo.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) {
        return sendJson(response, 400, { error: 'La foto no tiene un formato válido' });
    }

    const image = Buffer.from(match[2], 'base64');
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('photo', new Blob([image], { type: match[1] }), `${user.id}-${Date.now()}.jpg`);
    form.append('caption', `✅ Asistencia registrada\n👤 ${user.name}\n🪪 ${user.id}\n📌 ${movement}\n🕒 ${date}`);

    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        body: form
    });
    if (!telegramResponse.ok) {
        return sendJson(response, 502, { error: 'Telegram rechazó el envío' });
    }

    return sendJson(response, 200, { ok: true });
};
