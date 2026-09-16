const DATA_KEY = 'asistencias-qr-data';

function sendJson(response, status, body) {
    response.status(status).setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(body));
}

function getConfig() {
    return {
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN
    };
}

async function kvRequest(command) {
    const { url, token } = getConfig();
    if (!url || !token) return null;
    const result = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(command)
    });
    if (!result.ok) throw new Error(`KV respondió con estado ${result.status}`);
    return result.json();
}

module.exports = async function data(request, response) {
    if (request.method !== 'GET' && request.method !== 'PUT') {
        response.setHeader('Allow', 'GET, PUT');
        return sendJson(response, 405, { error: 'Método no permitido' });
    }

    if (!getConfig().url || !getConfig().token) {
        return sendJson(response, 503, {
            error: 'La sincronización compartida no está configurada',
            detail: 'Configura KV_REST_API_URL y KV_REST_API_TOKEN en Vercel.'
        });
    }

    try {
        if (request.method === 'GET') {
            const result = await kvRequest(['GET', DATA_KEY]);
            const data = result?.result ? JSON.parse(result.result) : null;
            return sendJson(response, 200, data || { profiles: {}, records: [] });
        }

        const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
        const profiles = body.profiles && typeof body.profiles === 'object' ? body.profiles : {};
        const records = Array.isArray(body.records) ? body.records.slice(0, 500) : [];
        await kvRequest(['SET', DATA_KEY, JSON.stringify({ profiles, records })]);
        return sendJson(response, 200, { ok: true });
    } catch (error) {
        return sendJson(response, 500, { error: 'No se pudo sincronizar la información' });
    }
};
