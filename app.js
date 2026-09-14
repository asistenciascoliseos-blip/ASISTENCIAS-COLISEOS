const $ = (id) => document.getElementById(id);
const state = { user: null, movement: null, photoStream: null, scanner: null, adminUnlocked: false, qrPhoto: '' };
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
    $('movement-message').classList.add('hidden');
    updateCaptureButton();
    updateSummary();
    if (state.user) openPhotoPanel();
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
    updateCaptureButton();
    $('scanner-message').textContent = 'Usuario identificado. Confirma el tipo de movimiento.';
}

function updateCaptureButton() {
    const ready = Boolean(state.user && state.movement);
    $('capture-button').disabled = !ready;
    $('capture-button').textContent = ready ? 'Abrir cámara trasera' : 'Seleccione su turno';
    if (state.user && !state.movement) $('movement-message').classList.remove('hidden');
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
$('qr-image').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file || !window.Html5Qrcode) return;
    try {
        if (state.scanner) {
            await state.scanner.stop().catch(() => {});
            state.scanner.clear();
        }
        state.scanner = new Html5Qrcode('reader');
        const decoded = await state.scanner.scanFile(file, true);
        selectUser(decoded);
        $('scanner-message').textContent = 'QR leído desde la galería.';
        state.scanner.clear();
    } catch {
        $('scanner-message').textContent = 'No se encontró un QR legible en esa imagen.';
    } finally {
        event.target.value = '';
    }
});

function updateSummary() {
    if (!state.user) return;
    $('attendance-summary').innerHTML = `<b>${state.user.name}</b><br>${state.movement} · ${localDate()}`;
}

async function openPhotoPanel() {
    if (!state.user || !state.movement || !$('photo-panel').classList.contains('hidden')) return;
    $('photo-panel').style.display = '';
    $('photo-panel').classList.remove('hidden');
    updateSummary();
    try {
        state.photoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
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
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const fontSize = Math.max(15, Math.round(canvas.width / 38));
    const lines = [
        state.user.name,
        `${state.user.id} · ${state.movement}`,
        localDate()
    ];
    const lineHeight = fontSize * 1.35;
    const barHeight = lineHeight * lines.length + fontSize;
    context.fillStyle = 'rgba(13, 19, 36, 0.78)';
    context.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);
    context.fillStyle = '#ffffff';
    context.font = `700 ${fontSize}px Arial, sans-serif`;
    context.textBaseline = 'middle';
    lines.forEach((line, index) => {
        context.fillText(line, fontSize, canvas.height - barHeight + fontSize + index * lineHeight);
    });
    $('photo-preview').src = canvas.toDataURL('image/jpeg', .85);
    $('photo-preview').classList.remove('hidden');
    $('take-photo').classList.add('hidden');
    $('send-attendance').classList.remove('hidden');
});
$('send-attendance').addEventListener('click', sendAttendance);

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

async function sendAttendance() {
    const button = $('send-attendance');
    button.disabled = true;
    const photo = $('photo-preview').src;
    sendToTelegram(photo).catch(() => {});
    saveRecord(true);
    state.photoStream?.getTracks().forEach((track) => track.stop());
    $('photo-video').srcObject = null;
    $('photo-panel').classList.add('hidden');
    $('photo-panel').style.display = 'none';
    $('take-photo').classList.remove('hidden');
    $('send-attendance').classList.add('hidden');
    $('send-attendance').disabled = false;
    $('send-attendance').textContent = 'Enviar asistencia';
    $('photo-preview').removeAttribute('src');
    state.user = null;
    state.movement = null;
    document.querySelectorAll('.movement').forEach((item) => item.classList.remove('active'));
    $('movement-message').textContent = 'Seleccione su turno para continuar';
    $('movement-message').classList.remove('hidden');
    $('capture-button').disabled = true;
    $('user-preview').classList.add('empty');
    $('user-preview').innerHTML = '<div class="avatar">?</div><div><strong>Esperando usuario</strong><p>Escanea un QR para continuar</p></div>';
    showToast('Enviado con éxito. Registro exitoso.');
}

function bindPhotoControls() {
    $('take-photo').addEventListener('click', () => {
        const video = $('photo-video');
        const canvas = $('photo-canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const fontSize = Math.max(15, Math.round(canvas.width / 38));
        const lines = [state.user?.name || '', `${state.user?.id || ''} · ${state.movement || ''}`, localDate()];
        const lineHeight = fontSize * 1.35;
        const barHeight = lineHeight * lines.length + fontSize;
        context.fillStyle = 'rgba(13, 19, 36, 0.78)';
        context.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);
        context.fillStyle = '#ffffff';
        context.font = `700 ${fontSize}px Arial, sans-serif`;
        context.textBaseline = 'middle';
        lines.forEach((line, index) => context.fillText(line, fontSize, canvas.height - barHeight + fontSize + index * lineHeight));
        $('photo-preview').src = canvas.toDataURL('image/jpeg', .85);
        $('photo-preview').classList.remove('hidden');
        $('take-photo').classList.add('hidden');
        $('send-attendance').classList.remove('hidden');
    });
    $('send-attendance').addEventListener('click', sendAttendance);
}

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
    $('profile-manager').classList.toggle('hidden', !state.adminUnlocked);
    if (state.adminUnlocked) renderProfiles();
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
        const image = new Image();
        image.onload = () => {
            const size = 240;
            const scale = Math.min(size / image.width, size / image.height, 1);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(image.width * scale);
            canvas.height = Math.round(image.height * scale);
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            state.qrPhoto = canvas.toDataURL('image/jpeg', 0.68);
            $('qr-photo-preview').src = state.qrPhoto;
            $('qr-photo-preview').classList.remove('hidden');
        };
        image.src = reader.result;
    };
    reader.readAsDataURL(file);
});

function renderProfiles() {
    const profiles = getProfiles();
    const search = ($('profile-search').value || '').trim().toLowerCase();
    const entries = Object.entries(profiles).filter(([id, profile]) => `${id} ${profile.name} ${profile.area || ''}`.toLowerCase().includes(search));
    $('profile-count').textContent = `${Object.keys(profiles).length} ${Object.keys(profiles).length === 1 ? 'usuario' : 'usuarios'}`;
    $('profile-list').innerHTML = entries.length ? entries.map(([id, profile]) => `
        <div class="profile-row">
            ${profile.photo ? `<img class="user-thumb" src="${profile.photo}" alt="">` : `<div class="avatar">${profile.name.charAt(0).toUpperCase()}</div>`}
            <div class="profile-info"><strong>${profile.name}</strong><span>${id}${profile.area ? ` · ${profile.area}` : ''}</span></div>
            <button class="delete-profile secondary-button" data-profile-id="${id}">Eliminar</button>
        </div>`).join('') : '<p class="empty-state">No hay usuarios que coincidan.</p>';
    document.querySelectorAll('.delete-profile').forEach((button) => button.addEventListener('click', () => {
        const id = button.dataset.profileId;
        if (!confirm(`¿Eliminar el QR de ${profiles[id]?.name || id}?`)) return;
        const updated = getProfiles();
        delete updated[id];
        localStorage.setItem(profilesKey, JSON.stringify(updated));
        renderProfiles();
        showToast('Usuario y QR eliminados.');
    }));
}
$('profile-search').addEventListener('input', renderProfiles);
