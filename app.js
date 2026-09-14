const $ = (id) => document.getElementById(id);
const state = { user: null, movement: 'Entrada', photoStream: null, scanner: null, adminUnlocked: false, qrPhoto: '' };
const historyKey = 'asistencias-qr-history';
const profilesKey = 'asistencias-qr-profiles';
const adminUser = '73056065';
const adminPassword = 'PLANILLA2026';

function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function localDate() {
    return new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

function updateClock() {
    const now = new Date();
    $('today-label').textContent = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    $('clock-label').textContent = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((nav) => nav.classList.remove('active'));
    document.querySelectorAll('.view').forEach((view) => view.classList.remove('active-view'));
    item.classList.add('active');
    $(item.dataset.view).classList.add('active-view');
    $('page-title').textContent = { registro: 'Registrar asistencia', generador: 'Generar código QR', historial: 'Historial de asistencias', configuracion: 'Configuración' }[item.dataset.view];
    if (item.dataset.view === 'historial') renderHistory();
    if (item.dataset.view === 'generador') updateGeneratorAccess();
}));

function setAdminNavigation(visible) {
    document.querySelectorAll('.admin-only').forEach((item) => item.classList.toggle('hidden', !visible));
    $('admin-toggle').textContent = visible ? 'Salir de OP' : 'Acceso OP';
}

function closeAdminLogin() {
    $('admin-login').classList.add('hidden');
    $('login-message').textContent = '';
}

$('admin-toggle').addEventListener('click', () => {
    if (state.adminUnlocked) {
        state.adminUnlocked = false;
        setAdminNavigation(false);
        document.querySelectorAll('.view').forEach((view) => view.classList.remove('active-view'));
        $('registro').classList.add('active-view');
        document.querySelectorAll('.nav-item').forEach((nav) => nav.classList.remove('active'));
        document.querySelector('.nav-item[data-view="registro"]').classList.add('active');
        $('page-title').textContent = 'Registrar asistencia';
        return;
    }
    $('admin-login').classList.remove('hidden');
    $('login-user').focus();
});
$('close-admin-login').addEventListener('click', closeAdminLogin);
$('login-submit').addEventListener('click', () => {
    if ($('login-user').value.trim() === adminUser && $('login-password').value === adminPassword) {
        state.adminUnlocked = true;
        setAdminNavigation(true);
        closeAdminLogin();
        showToast('Acceso OP activado.');
    } else {
        $('login-message').textContent = 'Usuario o contraseña incorrectos.';
    }
});
$('login-password').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('login-submit').click(); });

document.querySelectorAll('.movement').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.movement').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    state.movement = button.dataset.movement;
    updateSummary();
}));

function parseUser(raw) {
    try {
        const parsed = JSON.parse(raw);
        return { id: parsed.id || parsed.usuario || raw, name: parsed.name || parsed.nombre || parsed.id || raw, area: parsed.area || '' };
    } catch {
        return { id: raw.trim(), name: raw.trim(), area: '' };
    }
}

function getProfiles() {
    try { return JSON.parse(localStorage.getItem(profilesKey) || '{}'); } catch { return {}; }
}

function selectUser(raw) {
    const user = parseUser(raw);
    if (!user.id) return;
    const profile = getProfiles()[user.id] || {};
    user.photo = profile.photo || '';
    state.user = user;
    $('user-preview').classList.remove('empty');
    const avatar = user.photo ? `<img class="user-thumb" src="${user.photo}" alt="">` : `<div class="avatar">${user.name.charAt(0).toUpperCase()}</div>`;
    $('user-preview').innerHTML = `${avatar}<div><strong>${user.name}</strong><p>${user.id}${user.area ? ` · ${user.area}` : ''}</p></div>`;
    $('capture-button').disabled = false;
    $('scanner-message').textContent = 'Usuario identificado. Confirma el tipo de movimiento.';
}

async function startScanner() {
    if (!window.Html5Qrcode) {
        $('scanner-message').textContent = 'No se pudo cargar el lector QR. Revisa tu conexión.';
        return;
    }
    $('start-scanner').disabled = true;
    $('start-scanner').textContent = 'Solicitando cámara...';
    state.scanner = new Html5Qrcode('reader');
    try {
        await state.scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, (decoded) => {
            selectUser(decoded);
            state.scanner.stop().catch(() => {});
            $('start-scanner').classList.remove('hidden');
            $('start-scanner').disabled = false;
            $('start-scanner').textContent = 'Activar cámara';
        }, () => {});
        $('reader').querySelector('.reader-placeholder')?.remove();
    } catch (error) {
        $('scanner-message').textContent = 'No se pudo activar la cámara. Usa HTTPS o localhost y revisa los permisos.';
        $('start-scanner').disabled = false;
        $('start-scanner').textContent = 'Activar cámara';
    }
}
$('start-scanner').addEventListener('click', startScanner);
$('manual-submit').addEventListener('click', () => selectUser($('manual-code').value));
$('manual-code').addEventListener('keydown', (event) => { if (event.key === 'Enter') selectUser(event.target.value); });

function updateSummary() {
    if (!state.user) return;
    $('attendance-summary').innerHTML = `<b>${state.user.name}</b><br>${state.movement} · ${localDate()}`;
}

async function openPhotoPanel() {
    if (!state.user) return;
    $('photo-panel').classList.remove('hidden');
    updateSummary();
    try {
        state.photoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        $('photo-video').srcObject = state.photoStream;
    } catch {
        $('photo-video').style.display = 'none';
        $('scanner-message').textContent = 'No se pudo abrir la cámara para la foto. Revisa los permisos.';
    }
}
$('capture-button').addEventListener('click', openPhotoPanel);
$('close-photo').addEventListener('click', () => {
    state.photoStream?.getTracks().forEach((track) => track.stop());
    $('photo-panel').classList.add('hidden');
});

$('take-photo').addEventListener('click', () => {
    const video = $('photo-video');
    const canvas = $('photo-canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    $('photo-preview').src = canvas.toDataURL('image/jpeg', .85);
    $('photo-preview').classList.remove('hidden');
    $('send-attendance').disabled = false;
    $('take-photo').classList.add('hidden');
    $('retake-photo').classList.remove('hidden');
});
$('retake-photo').addEventListener('click', () => {
    $('take-photo').classList.remove('hidden');
    $('retake-photo').classList.add('hidden');
    $('send-attendance').disabled = true;
});

function saveRecord(sent) {
    const records = JSON.parse(localStorage.getItem(historyKey) || '[]');
    records.unshift({ ...state.user, movement: state.movement, date: localDate(), sent });
    localStorage.setItem(historyKey, JSON.stringify(records.slice(0, 100)));
}

async function sendToTelegram(photo) {
    const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo, user: state.user, movement: state.movement, date: localDate() })
    });
    if (!response.ok) throw new Error('El servidor no pudo enviar la asistencia');
    return true;
}

$('send-attendance').addEventListener('click', async () => {
    const button = $('send-attendance');
    button.disabled = true;
    button.textContent = 'Enviando...';
    const photo = $('photo-preview').src;
    let sent = false;
    try { sent = await sendToTelegram(photo); } catch { showToast('Guardado localmente; Telegram no respondió.'); }
    saveRecord(sent);
    state.photoStream?.getTracks().forEach((track) => track.stop());
    $('photo-panel').classList.add('hidden');
    button.innerHTML = 'Enviar registro <span>→</span>';
    state.user = null;
    $('capture-button').disabled = true;
    $('user-preview').classList.add('empty');
    $('user-preview').innerHTML = '<div class="avatar">?</div><div><strong>Esperando usuario</strong><p>Escanea un QR para continuar</p></div>';
    showToast(sent ? 'Asistencia enviada a Telegram.' : 'Asistencia guardada en este dispositivo.');
});

$('generate-qr').addEventListener('click', () => {
    const name = $('qr-name').value.trim(), id = $('qr-id').value.trim(), area = $('qr-area').value.trim();
    if (!name || !id) { $('generator-message').textContent = 'Escribe el nombre y el ID del usuario.'; return; }
    const profiles = getProfiles();
    profiles[id] = { name, area, photo: state.qrPhoto };
    localStorage.setItem(profilesKey, JSON.stringify(profiles));
    $('qrcode').innerHTML = '';
    new QRCode($('qrcode'), { text: JSON.stringify({ name, id, area }), width: 200, height: 200, colorDark: '#172033', colorLight: '#ffffff' });
    $('qr-result-name').textContent = name;
    $('qr-result-id').textContent = `${id}${area ? ` · ${area}` : ''}`;
    $('download-qr').disabled = false;
    $('generator-message').textContent = 'Código creado correctamente.';
    state.qrPhoto = '';
    $('qr-photo').value = '';
    $('qr-photo-preview').classList.add('hidden');
});
$('download-qr').addEventListener('click', () => {
    const image = $('qrcode').querySelector('img') || $('qrcode').querySelector('canvas');
    if (!image) return;
    const link = document.createElement('a');
    link.download = `${$('qr-id').value.trim() || 'usuario'}-qr.png`;
    link.href = image.tagName === 'CANVAS' ? image.toDataURL() : image.src;
    link.click();
});

function renderHistory() {
    const records = JSON.parse(localStorage.getItem(historyKey) || '[]');
    $('empty-history').classList.toggle('hidden', records.length > 0);
    $('history-body').innerHTML = records.map((item) => `<tr><td><b>${item.name}</b><br><small>${item.id}</small></td><td>${item.movement}</td><td>${item.date}</td><td>${item.sent ? '<span class="sent">Enviado</span>' : 'Local'}</td></tr>`).join('');
}
$('clear-history').addEventListener('click', () => { localStorage.removeItem(historyKey); renderHistory(); showToast('Historial eliminado.'); });

function updateGeneratorAccess() {
    $('admin-lock').classList.toggle('hidden', state.adminUnlocked);
    $('generator-content').classList.toggle('hidden', !state.adminUnlocked);
}
$('unlock-admin').addEventListener('click', () => {
    if ($('admin-user').value.trim() === adminUser && $('admin-password').value === adminPassword) {
        state.adminUnlocked = true;
        updateGeneratorAccess();
        $('admin-user').value = '';
        $('admin-password').value = '';
    } else {
        $('admin-message').textContent = 'Contraseña incorrecta.';
    }
});
$('admin-password').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('unlock-admin').click(); });

$('qr-photo').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) { state.qrPhoto = ''; $('qr-photo-preview').classList.add('hidden'); return; }
    const reader = new FileReader();
    reader.onload = () => {
        state.qrPhoto = reader.result;
        $('qr-photo-preview').src = state.qrPhoto;
        $('qr-photo-preview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
});
