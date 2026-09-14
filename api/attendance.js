const { Buffer } = require('node:buffer');

function sendJson(response, status, body) {
    response.status(status).setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(body));
}

async function telegramRequest(token, method, payload) {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: payload instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
        body: payload instanceof FormData ? payload : JSON.stringify(payload)
    });

    let result = {};
    try { result = await response.json(); } catch (error) { result = {}; }
    return { ok: response.ok, status: response.status, result };
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
    const { photo, user, movement, date, newMembers, oldMembers } = body || {};
    if (!photo || !user?.name || !user?.id || !movement || !date) {
        return sendJson(response, 400, { error: 'Faltan datos de la asistencia' });
    }

    const match = photo.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) {
        return sendJson(response, 400, { error: 'La foto no tiene un formato válido' });
    }

    const image = Buffer.from(match[2], 'base64');
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('photo', new Blob([image], { type: match[1] }), `${user.id}-${Date.now()}.jpg`);
    const movementLabel = movement === 'Salida' ? 'Salida registrada' : 'Entrada registrada';
    const countsLine = movement === 'Salida' && (newMembers != null || oldMembers != null)
        ? `\n👥 Socios nuevos: ${Number(newMembers) || 0} · Socios antiguos: ${Number(oldMembers) || 0}`
        : '';
    const caption = `✅ ${movementLabel}\n👤 ${user.name}\n🪪 ${user.id}\n📌 ${movement}\n🕒 ${date}${countsLine}`;
    form.append('caption', caption);

    const telegramPhoto = await telegramRequest(token, 'sendPhoto', form);
    if (telegramPhoto.ok) {
        return sendJson(response, 200, { ok: true });
    }

    const description = telegramPhoto.result?.description || 'Telegram rechazó el envío';
    const fallbackText = caption;
    const telegramMessage = await telegramRequest(token, 'sendMessage', { chat_id: String(chatId), text: fallbackText });
    if (telegramMessage.ok) {
        return sendJson(response, 200, { ok: true, fallback: true });
    }

    const fallbackDescription = telegramMessage.result?.description || description;
    return sendJson(response, telegramPhoto.status || 502, {
        error: fallbackDescription,
        detail: 'Revisa que el chat_id sea el correcto y que hayas iniciado el bot en ese chat privado.'
    });
};
