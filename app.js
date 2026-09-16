const $ = (id) => document.getElementById(id);
const state = {
    user: null,
    movement: null,
    photoStream: null,
    scanner: null,
    adminUnlocked: localStorage.getItem('asistencias-qr-admin') === 'true',
    cameraPermissionGranted: localStorage.getItem('asistencias-qr-camera') === 'true',
    qrPhoto: ''
};
const historyKey = 'asistencias-qr-history';
const profilesKey = 'asistencias-qr-profiles';
const adminSessionKey = 'asistencias-qr-admin';
const cameraPermissionKey = 'asistencias-qr-camera';
const SedeOptions = ['FERRERO', 'MONTJOY', 'CHACARILLA', 'SAN IGNACIO'];
const TurnoOptions = ['MAÑANA', 'TARDE'];
const adminUser = '73056065';
const adminPassword = 'PLANILLA2026';
let syncTimer = null;
let cloudSyncAvailable = false;

function normalizeProfile(profile, fallbackId) {
    const safeProfile = profile || {};
    return {
        name: safeProfile.name || fallbackId || 'Usuario',
        id: safeProfile.id || fallbackId || 'sin-id',
        area: safeProfile.area || '',
        sede: SedeOptions.includes(safeProfile.sede) ? safeProfile.sede : '',
        turno: TurnoOptions.includes(safeProfile.turno) ? safeProfile.turno : '',
        photo: safeProfile.photo || ''
    };
}

function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

setAdminNavigation(state.adminUnlocked);

function exitCountsReady() {
    if (state.movement !== 'Salida') return true;
    const counts = getExitCounts();
    return Object.values(counts).every((value) => value !== null);
}

function requireExitCounts() {
    if (exitCountsReady()) return true;
    $('movement-message').textContent = 'Completa las 5 cantidades de salida antes de escanear.';
    $('movement-message').classList.remove('hidden');
    $('scanner-message').textContent = 'Primero escribe las cantidades de salida.';
    const firstEmpty = ['new-members-count', 'old-members-count', 'free-count', 'new-cards-count', 'renewed-cards-count']
        .find((id) => $(id).value.trim() === '');
    if (firstEmpty) $(firstEmpty).focus();
    return false;
}

function localDate() {
    return new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function localMonthKey(date = new Date()) {
    return localDateKey(date).slice(0, 7);
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
        localStorage.removeItem(adminSessionKey);
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
        localStorage.setItem(adminSessionKey, 'true');
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
    $('exit-counts').classList.toggle('hidden', state.movement !== 'Salida');
    if (state.movement === 'Salida') {
        $('scanner-message').textContent = 'Completa las cantidades de salida antes de escanear.';
        $('new-members-count').focus();
        if (state.user) resetRegistrationUser();
        stopScanner();
    }
    $('movement-message').classList.add('hidden');
    updateCaptureButton();
    updateSummary();
}));

function parseUser(raw) {
    const value = String(raw || '').trim();
    try {
        const parsed = JSON.parse(value);
        return {
            id: parsed.id || parsed.usuario || value,
            name: parsed.name || parsed.nombre || parsed.id || value,
            area: parsed.area || '',
            sede: parsed.sede || '',
            turno: parsed.turno || '',
            photo: parsed.photo || ''
        };
    } catch {
        const readField = (field) => {
            const match = value.match(new RegExp(`["']${field}["']\\s*:\\s*["']([^"']*)`, 'i'));
            return match ? match[1].replace(/\uFFFD/g, 'Ñ') : '';
        };
        const id = readField('id') || readField('usuario');
        const name = readField('name') || readField('nombre') || id;
        return {
            id: id || value,
            name: name || value,
            area: readField('area'),
            sede: readField('sede'),
            turno: normalizeTurno(readField('turno')),
            photo: ''
        };
    }
}

function qrPayload(profile) {
    return JSON.stringify(profile).replace(/[^\x00-\x7F]/g, (character) =>
        `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
    );
}

function normalizeTurno(value) {
    const compact = String(value || '').replace(/\uFFFD/g, '').replace(/\s+/g, '').toUpperCase();
    if (/MA.*ANA/.test(compact) || compact === 'MANANA') return 'MAÑANA';
    if (compact.includes('TARDE')) return 'TARDE';
    return value || '';
}

function getProfiles() {
    try {
        const raw = JSON.parse(localStorage.getItem(profilesKey) || '{}');
        const normalized = {};
        Object.entries(raw || {}).forEach(([key, profile]) => {
            const normalizedProfile = normalizeProfile(profile, key);
            normalized[normalizedProfile.id] = normalizedProfile;
        });
        localStorage.setItem(profilesKey, JSON.stringify(normalized));
        return normalized;
    } catch {
        return {};
    }
}

function getRecords() {
    try {
        const records = JSON.parse(localStorage.getItem(historyKey) || '[]');
        return Array.isArray(records) ? records : [];
    } catch {
        return [];
    }
}

function saveLocalData(profiles, records) {
    localStorage.setItem(profilesKey, JSON.stringify(profiles || {}));
    localStorage.setItem(historyKey, JSON.stringify(Array.isArray(records) ? records.slice(0, 500) : []));
}

function queueCloudSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncToCloud, 350);
}

async function syncToCloud() {
    try {
        const response = await fetch('/api/data', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profiles: getProfiles(), records: getRecords() })
        });
        cloudSyncAvailable = response.ok;
    } catch (error) {
        cloudSyncAvailable = false;
    }
}

async function loadCloudData() {
    try {
        const response = await fetch('/api/data', { cache: 'no-store' });
        if (!response.ok) return;
        const cloud = await response.json();
        const localProfiles = getProfiles();
        const localRecords = getRecords();
        const hasCloudData = Object.keys(cloud.profiles || {}).length > 0 || (cloud.records || []).length > 0;
        const hasLocalData = Object.keys(localProfiles).length > 0 || localRecords.length > 0;
        if (hasCloudData) {
            saveLocalData(cloud.profiles, cloud.records);
        } else if (hasLocalData) {
            await syncToCloud();
        }
        cloudSyncAvailable = true;
        if (state.adminUnlocked) {
            renderProfiles();
            renderHistory();
        }
    } catch (error) {
        cloudSyncAvailable = false;
    }
}

function selectUser(raw) {
    const user = parseUser(raw);
    if (!user.id) return;
    const profile = getProfiles()[user.id] || {};
    const resolved = {
        ...user,
        ...profile,
        id: user.id || profile.id,
        name: user.name || profile.name,
        area: profile.area || user.area || '',
        sede: profile.sede || user.sede || '',
        turno: profile.turno || user.turno || '',
        photo: profile.photo || user.photo || ''
    };
    state.user = resolved;
    $('user-preview').classList.remove('empty');
    const avatar = resolved.photo ? `<img class="user-thumb" src="${resolved.photo}" alt="">` : `<div class="avatar">${resolved.name.charAt(0).toUpperCase()}</div>`;
    const meta = [resolved.sede, resolved.turno].filter(Boolean).join(' · ');
    $('user-preview').innerHTML = `${avatar}<div><strong>${resolved.name}</strong><p>${resolved.id}${meta ? ` · ${meta}` : ''}${resolved.area ? ` · ${resolved.area}` : ''}</p></div>`;
    updateCaptureButton();
    $('scanner-message').textContent = 'Usuario identificado. Confirma el tipo de movimiento.';
}

function updateCaptureButton() {
    const ready = Boolean(state.user && state.movement);
    $('capture-button').disabled = !ready;
    $('capture-button').textContent = ready ? 'Abrir cámara trasera' : 'Seleccione su turno';
    if (state.user && !state.movement) $('movement-message').classList.remove('hidden');
}

function resetRegistrationUser() {
    state.user = null;
    $('user-preview').classList.add('empty');
    $('user-preview').innerHTML = '<div class="avatar">?</div><div><strong>Esperando usuario</strong><p>Escanea un QR para continuar</p></div>';
    updateCaptureButton();
}

async function stopScanner() {
    if (!state.scanner) return;
    await state.scanner.stop().catch(() => {});
    await state.scanner.clear().catch(() => {});
    state.scanner = null;
}

async function startScanner() {
    if (!state.movement) {
        $('movement-message').textContent = 'Primero selecciona Entrada o Salida.';
        $('movement-message').classList.remove('hidden');
        return;
    }
    if (!requireExitCounts()) return;
    if (!window.Html5Qrcode) {
        $('scanner-message').textContent = 'No se pudo cargar el lector QR. Revisa tu conexión.';
        return;
    }
    if (state.scanner) {
        await state.scanner.stop().catch(() => {});
        state.scanner.clear();
        state.scanner = null;
    }
    $('reader').innerHTML = '';
    $('start-scanner').disabled = true;
    $('start-scanner').textContent = 'Solicitando cámara...';
    state.scanner = new Html5Qrcode('reader');
    let handled = false;
    const scanConfig = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        disableFlip: false
    };
    try {
        await state.scanner.start(
            { facingMode: 'environment' },
            scanConfig,
            (decoded) => {
            if (handled) return;
            handled = true;
            selectUser(decoded);
            stopScanner().then(() => {
                $('reader').innerHTML = '<div class="reader-placeholder"><span>✓</span><p>Usuario identificado</p></div>';
                $('start-scanner').disabled = true;
                $('start-scanner').textContent = 'Asistencia en curso';
                openPhotoPanel();
            }).catch(() => {});
            },
            () => {}
        );
        state.cameraPermissionGranted = true;
        localStorage.setItem(cameraPermissionKey, 'true');
        $('scanner-message').textContent = 'Apunta la cámara al código QR y acércalo un poco.';
    } catch (error) {
        try { await state.scanner.clear(); } catch (clearError) { /* lector ya detenido */ }
        state.scanner = null;
        $('reader').innerHTML = '<div class="reader-placeholder"><span>⌁</span><p>La cámara aparecerá aquí</p></div>';
        $('scanner-message').textContent = 'No se pudo abrir la cámara. Revisa el permiso del navegador y usa HTTPS.';
        $('start-scanner').disabled = false;
        $('start-scanner').textContent = state.cameraPermissionGranted ? 'Activar cámara' : 'Permitir cámara';
    }
}
$('start-scanner').textContent = state.cameraPermissionGranted ? 'Activar cámara' : 'Permitir cámara';
$('start-scanner').addEventListener('click', startScanner);
$('manual-submit').addEventListener('click', () => {
    if (!state.movement) return;
    if (requireExitCounts()) {
        selectUser($('manual-code').value);
        openPhotoPanel();
    }
});
$('manual-code').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') $('manual-submit').click();
});
$('qr-image').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file || !window.Html5Qrcode || !state.movement || !requireExitCounts()) return;
    try {
        if (state.scanner) {
            await state.scanner.stop().catch(() => {});
            state.scanner.clear();
            state.scanner = null;
        }
        $('reader').innerHTML = '';
        state.scanner = new Html5Qrcode('reader');
        const decoded = await state.scanner.scanFile(file, true);
        selectUser(decoded);
        $('scanner-message').textContent = 'QR leído desde la galería.';
        state.scanner.clear();
        state.scanner = null;
        $('reader').innerHTML = '<div class="reader-placeholder"><span>✓</span><p>Usuario identificado</p></div>';
        $('start-scanner').disabled = true;
        $('start-scanner').textContent = 'Asistencia en curso';
        openPhotoPanel();
    } catch {
        $('scanner-message').textContent = 'No se encontró un QR legible en esa imagen.';
    } finally {
        event.target.value = '';
    }
});

function updateSummary() {
    if (!state.user) return;
    const counts = getExitCounts();
    const countLine = state.movement === 'Salida' && hasExitCounts(counts)
        ? `<br>Socios nuevos: ${counts.newMembers || 0} · Socios antiguos: ${counts.oldMembers || 0}<br>Libres: ${counts.freeCount || 0} · Cartillas nuevas: ${counts.newCards || 0}<br>Cartillas renovadas: ${counts.renewedCards || 0}`
        : '';
    const meta = [state.user.sede, state.user.turno].filter(Boolean).join(' · ');
    $('attendance-summary').innerHTML = `<b>${state.user.name}</b><br>${state.movement} · ${meta || 'Sin sede'} · ${localDate()}${countLine}`;
}

function getExitCounts() {
    const readCount = (id) => {
        const value = $(id).value.trim();
        if (value === '') return null;
        return Math.max(0, Number.parseInt(value, 10) || 0);
    };
    return {
        newMembers: readCount('new-members-count'),
        oldMembers: readCount('old-members-count'),
        freeCount: readCount('free-count'),
        newCards: readCount('new-cards-count'),
        renewedCards: readCount('renewed-cards-count')
    };
}

$('new-members-count').addEventListener('input', updateSummary);
$('old-members-count').addEventListener('input', updateSummary);
$('free-count').addEventListener('input', updateSummary);
$('new-cards-count').addEventListener('input', updateSummary);
$('renewed-cards-count').addEventListener('input', updateSummary);

function hasExitCounts(counts) {
    return Object.values(counts).some((value) => value !== null);
}

async function openPhotoPanel() {
    if (!state.user || !state.movement || !$('photo-panel').classList.contains('hidden')) return;
    $('photo-panel').style.display = '';
    $('photo-panel').classList.remove('hidden');
    $('take-photo').disabled = true;
    $('take-photo').textContent = 'Preparando cámara...';
    $('photo-video').style.display = '';
    updateSummary();
    try {
        state.photoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        state.cameraPermissionGranted = true;
        localStorage.setItem(cameraPermissionKey, 'true');
        const video = $('photo-video');
        video.srcObject = state.photoStream;
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('La cámara tardó demasiado')), 8000);
            const ready = () => {
                clearTimeout(timeout);
                video.removeEventListener('loadedmetadata', ready);
                resolve();
            };
            video.addEventListener('loadedmetadata', ready, { once: true });
            if (video.readyState >= 2) ready();
        });
        await video.play();
        $('take-photo').disabled = false;
        $('take-photo').textContent = 'Tomar foto';
    } catch (error) {
        state.photoStream?.getTracks().forEach((track) => track.stop());
        state.photoStream = null;
        $('photo-video').style.display = 'none';
        $('take-photo').disabled = true;
        $('take-photo').textContent = 'Cámara no disponible';
        $('scanner-message').textContent = 'No se pudo abrir la cámara para la foto. Revisa los permisos y HTTPS.';
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
    if (!state.photoStream || video.readyState < 2 || !video.videoWidth) {
        showToast('Espera a que la cámara esté lista.');
        return;
    }
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const fontSize = Math.max(15, Math.round(canvas.width / 38));
    const lines = [
        `Nombre: ${state.user.name}`,
        `DNI: ${state.user.id}`,
        `Sede: ${state.user.sede || 'Sin sede'}`,
        `Turno: ${state.user.turno || 'Sin turno'}`,
        `${state.movement} · ${localDate()}`
    ];
    const counts = getExitCounts();
    if (state.movement === 'Salida' && hasExitCounts(counts)) {
        lines.push(`Socio: ${counts.oldMembers || 0}`);
        lines.push(`Socios nuevos: ${counts.newMembers || 0}`);
        lines.push(`Libre: ${counts.freeCount || 0}`);
        lines.push(`Cartilla nueva: ${counts.newCards || 0}`);
        lines.push(`Cartilla renovada: ${counts.renewedCards || 0}`);
    }
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
    const userSnapshot = state.user || { id: 'usuario', name: 'Usuario', sede: '', turno: '' };
    const counts = getExitCounts();
    const dateNow = new Date();
    records.unshift({
        ...userSnapshot,
        movement: state.movement,
        date: localDate(),
        dateIso: dateNow.toISOString(),
        dayKey: localDateKey(dateNow),
        monthKey: localMonthKey(dateNow),
        sent,
        counts: state.movement === 'Salida' ? counts : null,
        sede: userSnapshot.sede || '',
        turno: userSnapshot.turno || ''
    });
    localStorage.setItem(historyKey, JSON.stringify(records.slice(0, 500)));
    queueCloudSync();
}

async function sendToTelegram(photo) {
    const counts = getExitCounts();
    const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            photo,
            user: {
                ...state.user,
                sede: state.user?.sede || '',
                turno: state.user?.turno || ''
            },
            movement: state.movement,
            date: localDate(),
            ...counts
        })
    });

    let payload = {};
    try { payload = await response.json(); } catch (error) { payload = {}; }

    if (!response.ok) {
        const message = payload?.error || 'El servidor no pudo enviar la asistencia';
        throw new Error(message);
    }

    return true;
}

async function sendAttendance() {
    const button = $('send-attendance');
    button.disabled = true;
    const photo = $('photo-preview').src;

    try {
        await sendToTelegram(photo);
        saveRecord(true);
        showToast('Enviado con éxito. Registro exitoso.');
    } catch (error) {
        saveRecord(false);
        const detail = error?.message || 'No se pudo enviar la asistencia.';
        showToast(`No se pudo enviar: ${detail}`);
    } finally {
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
        $('reader').innerHTML = '<div class="reader-placeholder"><span>⌁</span><p>La cámara aparecerá aquí</p></div>';
        $('start-scanner').disabled = false;
        $('start-scanner').textContent = 'Activar cámara';
        $('new-members-count').value = '';
        $('old-members-count').value = '';
        $('free-count').value = '';
        $('new-cards-count').value = '';
        $('renewed-cards-count').value = '';
        $('exit-counts').classList.add('hidden');
        document.querySelectorAll('.movement').forEach((item) => item.classList.remove('active'));
        $('movement-message').textContent = 'Seleccione su turno para continuar';
        $('movement-message').classList.remove('hidden');
        $('capture-button').disabled = true;
        $('user-preview').classList.add('empty');
        $('user-preview').innerHTML = '<div class="avatar">?</div><div><strong>Esperando usuario</strong><p>Escanea un QR para continuar</p></div>';
    }
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
        const lines = [
            `Nombre: ${state.user?.name || ''}`,
            `DNI: ${state.user?.id || ''}`,
            `Sede: ${state.user?.sede || 'Sin sede'}`,
            `Turno: ${state.user?.turno || 'Sin turno'}`,
            `${state.movement || ''} · ${localDate()}`
        ];
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
    const name = $('qr-name').value.trim();
    const id = $('qr-id').value.trim();
    const area = $('qr-area').value.trim();
    const sede = $('qr-sede').value.trim();
    const turno = $('qr-turno').value.trim();
    if (!name || !id) { $('generator-message').textContent = 'Escribe el nombre y el ID del usuario.'; return; }
    if (!sede || !turno) { $('generator-message').textContent = 'Selecciona la sede y el turno del usuario.'; return; }
    const profiles = getProfiles();
    const profile = { name, id, area, sede, turno, photo: state.qrPhoto };
    profiles[id] = profile;
    localStorage.setItem(profilesKey, JSON.stringify(profiles));
    queueCloudSync();
    $('qrcode').innerHTML = '';
    new QRCode($('qrcode'), { text: qrPayload(profile), width: 200, height: 200, colorDark: '#172033', colorLight: '#ffffff' });
    $('qr-result-name').textContent = name;
    $('qr-result-id').textContent = `${id} · ${sede} · ${turno}${area ? ` · ${area}` : ''}`;
    $('qr-name').value = name;
    $('qr-id').value = id;
    $('qr-sede').value = sede;
    $('qr-turno').value = turno;
    $('qr-area').value = area;
    $('download-qr').disabled = false;
    $('generator-message').textContent = 'Código creado correctamente.';
    state.qrPhoto = '';
    $('qr-photo').value = '';
    $('qr-photo-preview').classList.add('hidden');
    renderProfiles();
});
$('download-qr').addEventListener('click', () => {
    const image = $('qrcode').querySelector('img') || $('qrcode').querySelector('canvas');
    if (!image) return;
    const name = $('qr-result-name').textContent.trim() || $('qr-name').value.trim();
    const id = $('qr-result-id').textContent.split(' · ')[0].trim() || $('qr-id').value.trim();
    const qrCanvas = document.createElement('canvas');
    qrCanvas.width = 320;
    qrCanvas.height = 440;
    const context = qrCanvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, qrCanvas.width, qrCanvas.height);

    const drawCard = () => {
        const source = image.tagName === 'CANVAS' ? image : image;
        context.drawImage(source, 60, 24, 200, 200);
        const profileId = $('qr-id').value.trim() || id;
        const profileSede = $('qr-sede').value.trim() || 'Sin sede';
        context.fillStyle = '#172033';
        context.textAlign = 'center';
        context.font = '700 22px Arial, sans-serif';
        context.fillText('Nombre', qrCanvas.width / 2, 270);
        context.font = '600 20px Arial, sans-serif';
        context.fillText(name.slice(0, 28), qrCanvas.width / 2, 300);
        context.font = '700 22px Arial, sans-serif';
        context.fillText('DNI', qrCanvas.width / 2, 335);
        context.font = '600 20px Arial, sans-serif';
        context.fillText(profileId.slice(0, 28), qrCanvas.width / 2, 360);
        context.font = '700 22px Arial, sans-serif';
        context.fillText('Sede', qrCanvas.width / 2, 395);
        context.font = '600 20px Arial, sans-serif';
        context.fillText(profileSede.slice(0, 28), qrCanvas.width / 2, 420);
        const link = document.createElement('a');
        link.download = `${id || 'usuario'}-qr.png`;
        link.href = qrCanvas.toDataURL('image/png');
        link.click();
    };

    if (image.tagName === 'IMG' && !image.complete) {
        image.onload = drawCard;
    } else {
        drawCard();
    }
});

function showProfileQr(id) {
    const profile = getProfiles()[id];
    if (!profile) return;
    $('qrcode').innerHTML = '';
    new QRCode($('qrcode'), {
        text: qrPayload({ name: profile.name, id, area: profile.area || '', sede: profile.sede || '', turno: profile.turno || '' }),
        width: 200,
        height: 200,
        colorDark: '#172033',
        colorLight: '#ffffff'
    });
    $('qr-result-name').textContent = profile.name;
    $('qr-result-id').textContent = `${id} · ${profile.sede || 'Sin sede'} · ${profile.turno || 'Sin turno'}${profile.area ? ` · ${profile.area}` : ''}`;
    $('qr-name').value = profile.name || '';
    $('qr-id').value = id;
    $('qr-sede').value = profile.sede || '';
    $('qr-turno').value = profile.turno || '';
    $('qr-area').value = profile.area || '';
    $('download-qr').disabled = false;
    $('generator-message').textContent = 'QR recuperado correctamente.';
    $('qrcode').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function openEditProfile(id) {
    const profile = getProfiles()[id];
    if (!profile) return;
    $('edit-profile-original-id').value = id;
    $('edit-profile-name').value = profile.name || '';
    $('edit-profile-id').value = id;
    $('edit-profile-sede').value = profile.sede || '';
    $('edit-profile-turno').value = profile.turno || '';
    $('edit-profile-area').value = profile.area || '';
    $('edit-profile-photo').value = '';
    $('edit-profile-message').textContent = '';
    $('edit-profile-modal').classList.remove('hidden');
}

$('close-edit-profile').addEventListener('click', () => $('edit-profile-modal').classList.add('hidden'));
$('save-edit-profile').addEventListener('click', () => {
    const originalId = $('edit-profile-original-id').value;
    const name = $('edit-profile-name').value.trim();
    const id = $('edit-profile-id').value.trim();
    const sede = $('edit-profile-sede').value.trim();
    const turno = $('edit-profile-turno').value.trim();
    const area = $('edit-profile-area').value.trim();
    if (!name || !id) {
        $('edit-profile-message').textContent = 'Escribe el nombre y el ID.';
        return;
    }
    if (!sede || !turno) {
        $('edit-profile-message').textContent = 'Selecciona la sede y el turno del usuario.';
        return;
    }
    const profiles = getProfiles();
    if (id !== originalId && profiles[id]) {
        $('edit-profile-message').textContent = 'Ese ID ya existe.';
        return;
    }
    const save = (photo) => {
        const updated = { name, area, sede, turno, photo: photo || profiles[originalId]?.photo || '' };
        if (id !== originalId) delete profiles[originalId];
        profiles[id] = updated;
        localStorage.setItem(profilesKey, JSON.stringify(profiles));
        queueCloudSync();
        $('edit-profile-modal').classList.add('hidden');
        renderProfiles();
        showProfileQr(id);
        showToast('Usuario actualizado.');
    };
    const file = $('edit-profile-photo').files[0];
    if (!file) {
        save('');
        return;
    }
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
            save(canvas.toDataURL('image/jpeg', 0.68));
        };
        image.src = reader.result;
    };
    reader.readAsDataURL(file);
});

function getStoredRecords() {
    try {
        const records = JSON.parse(localStorage.getItem(historyKey) || '[]');
        return Array.isArray(records) ? records : [];
    } catch (error) {
        return [];
    }
}

function countValue(value) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) && number >= 0 ? number : 0;
}

function getEditDayValues() {
    return {
        oldMembers: countValue($('edit-day-old-members').value),
        newMembers: countValue($('edit-day-new-members').value),
        freeCount: countValue($('edit-day-free').value),
        newCards: countValue($('edit-day-new-cards').value),
        renewedCards: countValue($('edit-day-renewed-cards').value)
    };
}

function openEditDay(day = localDateKey()) {
    $('edit-day-date').value = day;
    $('edit-day-sede').value = '';
    $('edit-day-turno').value = '';
    $('edit-day-old-members').value = '0';
    $('edit-day-new-members').value = '0';
    $('edit-day-free').value = '0';
    $('edit-day-new-cards').value = '0';
    $('edit-day-renewed-cards').value = '0';
    $('edit-day-message').textContent = '';
    $('edit-day-modal').classList.remove('hidden');
}

function loadManualDayValues() {
    const day = $('edit-day-date').value;
    const sede = $('edit-day-sede').value;
    const turno = $('edit-day-turno').value;
    const manual = getStoredRecords().find((item) =>
        item.manual &&
        item.dayKey === day &&
        item.sede === sede &&
        item.turno === turno
    );
    const values = manual?.counts || {};
    $('edit-day-old-members').value = String(values.oldMembers || 0);
    $('edit-day-new-members').value = String(values.newMembers || 0);
    $('edit-day-free').value = String(values.freeCount || 0);
    $('edit-day-new-cards').value = String(values.newCards || 0);
    $('edit-day-renewed-cards').value = String(values.renewedCards || 0);
}

function deleteDay(day) {
    const records = getStoredRecords();
    const dayRecords = records.filter((item) => (item.dayKey || item.dateIso?.slice(0, 10)) === day);
    if (!dayRecords.length) {
        showToast('No hay registros para ese día.');
        return;
    }
    if (!confirm(`¿Borrar todos los registros locales del día ${day}? Esto no elimina los mensajes de Telegram.`)) return;
    localStorage.setItem(historyKey, JSON.stringify(records.filter((item) => (item.dayKey || item.dateIso?.slice(0, 10)) !== day)));
    queueCloudSync();
    $('edit-day-modal').classList.add('hidden');
    renderHistory();
    showToast(`Día ${day} borrado de la página.`);
}

function saveEditedDay() {
    const day = $('edit-day-date').value;
    const sede = $('edit-day-sede').value;
    const turno = $('edit-day-turno').value;
    if (!day || !sede || !turno) {
        $('edit-day-message').textContent = 'Selecciona fecha, sede y turno.';
        return;
    }
    const records = getStoredRecords();
    const manualId = `manual-${day}-${sede}-${turno}`;
    const values = getEditDayValues();
    const filtered = records.filter((item) => item.manualId !== manualId);
    filtered.unshift({
        id: manualId,
        manualId,
        manual: true,
        name: 'Ajuste manual',
        user: 'Ajuste manual',
        movement: 'Salida',
        sede,
        turno,
        date: `${day} (ajuste manual)`,
        dayKey: day,
        monthKey: day.slice(0, 7),
        dateIso: new Date(`${day}T12:00:00`).toISOString(),
        sent: false,
        counts: values
    });
    localStorage.setItem(historyKey, JSON.stringify(filtered.slice(0, 500)));
    queueCloudSync();
    $('edit-day-modal').classList.add('hidden');
    renderHistory();
    showToast('Resumen guardado solo en la página.');
}

function renderDailySummary() {
    const records = getStoredRecords();
    const dailyEntries = {};
    const manualEntries = {};
    records.filter((item) => item.movement === 'Salida' && item.counts).forEach((item) => {
        const day = item.dayKey || item.dateIso?.slice(0, 10) || 'sin-fecha';
        const sede = item.sede || 'SIN SEDE';
        const turno = item.turno || 'SIN TURNO';
        const dailyKey = `${day}|${sede}|${turno}`;
        if (item.manual) {
            manualEntries[dailyKey] = {
                day,
                sede,
                turno,
                counts: item.counts || {}
            };
            return;
        }
        if (!dailyEntries[dailyKey]) {
            dailyEntries[dailyKey] = {
                period: day,
                periodLabel: day,
                sede: item.sede || 'SIN SEDE',
                turno: item.turno || 'SIN TURNO',
                newMembers: 0,
                oldMembers: 0,
                freeCount: 0,
                newCards: 0,
                renewedCards: 0,
                records: 0
            };
        }
        const value = item.counts || {};
        dailyEntries[dailyKey].newMembers += Number(value.newMembers || 0);
        dailyEntries[dailyKey].oldMembers += Number(value.oldMembers || 0);
        dailyEntries[dailyKey].freeCount += Number(value.freeCount || 0);
        dailyEntries[dailyKey].newCards += Number(value.newCards || 0);
        dailyEntries[dailyKey].renewedCards += Number(value.renewedCards || 0);
        dailyEntries[dailyKey].records += 1;
    });

    Object.entries(manualEntries).forEach(([key, manual]) => {
        dailyEntries[key] = {
            period: manual.day,
            periodLabel: manual.day,
            sede: manual.sede,
            turno: manual.turno,
            newMembers: Number(manual.counts.newMembers || 0),
            oldMembers: Number(manual.counts.oldMembers || 0),
            freeCount: Number(manual.counts.freeCount || 0),
            newCards: Number(manual.counts.newCards || 0),
            renewedCards: Number(manual.counts.renewedCards || 0),
            records: dailyEntries[key]?.records || 0
        };
    });

    const dailyRows = Object.values(dailyEntries).sort((a, b) => b.period.localeCompare(a.period) || a.sede.localeCompare(b.sede) || a.turno.localeCompare(b.turno));
    const monthlyEntries = {};
    dailyRows.forEach((row) => {
        const month = row.period.slice(0, 7);
        const key = `${month}|${row.sede}|${row.turno}`;
        if (!monthlyEntries[key]) {
            monthlyEntries[key] = {
                period: month,
                periodLabel: month,
                sede: row.sede,
                turno: row.turno,
                newMembers: 0,
                oldMembers: 0,
                freeCount: 0,
                newCards: 0,
                renewedCards: 0,
                records: 0
            };
        }
        monthlyEntries[key].newMembers += row.newMembers;
        monthlyEntries[key].oldMembers += row.oldMembers;
        monthlyEntries[key].freeCount += row.freeCount;
        monthlyEntries[key].newCards += row.newCards;
        monthlyEntries[key].renewedCards += row.renewedCards;
        monthlyEntries[key].records += row.records;
    });
    const monthlyRows = Object.values(monthlyEntries).sort((a, b) => b.period.localeCompare(a.period) || a.sede.localeCompare(b.sede) || a.turno.localeCompare(b.turno));
    const columns = '<th>Periodo</th><th>Sede</th><th>Turno</th><th>Socios nuevos</th><th>Socios antiguos</th><th>Libres</th><th>Cartillas nuevas</th><th>Cartillas renovadas</th><th>Registros</th>';
    const makeRows = (rows) => rows.map((row) => `<tr><td>${row.periodLabel}</td><td>${row.sede}</td><td>${row.turno}</td><td>${row.newMembers}</td><td>${row.oldMembers}</td><td>${row.freeCount}</td><td>${row.newCards}</td><td>${row.renewedCards}</td><td>${row.records}</td></tr>`).join('');
    const table = (title, rows) => rows.length
        ? `<h3>${title}</h3><div class="summary-scroll"><table class="summary-table"><thead><tr>${columns}</tr></thead><tbody>${makeRows(rows)}</tbody></table></div>`
        : `<h3>${title}</h3><p class="empty-state">Todavía no hay datos.</p>`;
    const dayButtons = [...new Set(dailyRows.map((row) => row.period))].map((day) => `<button class="secondary-button summary-day-button" data-summary-day="${day}">Editar ${day}</button><button class="secondary-button summary-day-button danger" data-delete-day="${day}">Borrar ${day}</button>`).join('');
    $('daily-summary').innerHTML = `${table('Resumen diario', dailyRows)}<div class="summary-day-actions">${dayButtons || '<span class="muted">No hay días registrados.</span>'}</div>${table('Resumen mensual acumulado', monthlyRows)}`;
    document.querySelectorAll('[data-summary-day]').forEach((button) => button.addEventListener('click', () => openEditDay(button.dataset.summaryDay)));
    document.querySelectorAll('[data-delete-day]').forEach((button) => button.addEventListener('click', () => deleteDay(button.dataset.deleteDay)));
    window.summaryCopyText = [
        'RESUMEN DIARIO',
        'Periodo\tSede\tTurno\tSocios nuevos\tSocios antiguos\tLibres\tCartillas nuevas\tCartillas renovadas\tRegistros',
        ...dailyRows.map((row) => [row.periodLabel, row.sede, row.turno, row.newMembers, row.oldMembers, row.freeCount, row.newCards, row.renewedCards, row.records].join('\t')),
        '',
        'RESUMEN MENSUAL',
        'Periodo\tSede\tTurno\tSocios nuevos\tSocios antiguos\tLibres\tCartillas nuevas\tCartillas renovadas\tRegistros',
        ...monthlyRows.map((row) => [row.periodLabel, row.sede, row.turno, row.newMembers, row.oldMembers, row.freeCount, row.newCards, row.renewedCards, row.records].join('\t'))
    ].join('\n');
}

async function copySummary() {
    const text = window.summaryCopyText || '';
    if (!text) {
        showToast('Todavía no hay resumen para copiar.');
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        showToast('Resumen copiado. Puedes pegarlo en Excel.');
    } catch (error) {
        const helper = document.createElement('textarea');
        helper.value = text;
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        helper.remove();
        showToast('Resumen copiado. Puedes pegarlo en Excel.');
    }
}

function renderHistory() {
    const records = JSON.parse(localStorage.getItem(historyKey) || '[]');
    $('empty-history').classList.toggle('hidden', records.length > 0);
    $('history-body').innerHTML = records.map((item) => `<tr><td><b>${item.name}</b><br><small>${item.id || ''}</small></td><td>${item.sede || 'Sin sede'}<br><small>${item.turno || 'Sin turno'}</small></td><td>${item.manual ? 'Ajuste local' : item.movement}</td><td>${item.date}</td><td>${item.manual ? '<span class="pending">Solo página</span>' : item.sent ? '<span class="sent">Enviado</span>' : '<span class="pending">Pendiente</span>'}</td></tr>`).join('');
    renderDailySummary();
}
$('clear-history').addEventListener('click', () => { localStorage.removeItem(historyKey); queueCloudSync(); renderHistory(); showToast('Historial eliminado.'); });
$('copy-summary').addEventListener('click', copySummary);
$('edit-day-summary').addEventListener('click', () => openEditDay());
$('close-edit-day').addEventListener('click', () => $('edit-day-modal').classList.add('hidden'));
$('save-edit-day').addEventListener('click', saveEditedDay);
$('delete-edit-day').addEventListener('click', () => {
    const day = $('edit-day-date').value;
    if (day) deleteDay(day);
});
$('edit-day-date').addEventListener('change', loadManualDayValues);
$('edit-day-sede').addEventListener('change', loadManualDayValues);
$('edit-day-turno').addEventListener('change', loadManualDayValues);

function updateGeneratorAccess() {
    $('admin-lock').classList.toggle('hidden', state.adminUnlocked);
    $('generator-content').classList.toggle('hidden', !state.adminUnlocked);
    $('profile-manager').classList.toggle('hidden', !state.adminUnlocked);
    if (state.adminUnlocked) renderProfiles();
}
$('unlock-admin').addEventListener('click', () => {
    if ($('admin-user').value.trim() === adminUser && $('admin-password').value === adminPassword) {
        state.adminUnlocked = true;
        localStorage.setItem(adminSessionKey, 'true');
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
    const entries = Object.entries(profiles).filter(([id, profile]) => `${id} ${profile.name} ${profile.area || ''} ${profile.sede || ''} ${profile.turno || ''}`.toLowerCase().includes(search));
    $('profile-count').textContent = `${Object.keys(profiles).length} ${Object.keys(profiles).length === 1 ? 'usuario' : 'usuarios'}`;
    $('profile-list').innerHTML = entries.length ? entries.map(([id, profile]) => `
        <div class="profile-row">
            ${profile.photo ? `<img class="user-thumb" src="${profile.photo}" alt="">` : `<div class="avatar">${profile.name.charAt(0).toUpperCase()}</div>`}
            <div class="profile-info"><strong>${profile.name}</strong><span>${id}${profile.sede ? ` · ${profile.sede}` : ''}${profile.turno ? ` · ${profile.turno}` : ''}${profile.area ? ` · ${profile.area}` : ''}</span></div>
            <button class="show-profile-qr secondary-button" data-profile-id="${id}">Ver QR</button>
            <button class="edit-profile secondary-button" data-profile-id="${id}">Editar</button>
            <button class="delete-profile secondary-button" data-profile-id="${id}">Eliminar</button>
        </div>`).join('') : '<p class="empty-state">No hay usuarios que coincidan.</p>';
    document.querySelectorAll('.show-profile-qr').forEach((button) => button.addEventListener('click', () => showProfileQr(button.dataset.profileId)));
    document.querySelectorAll('.edit-profile').forEach((button) => button.addEventListener('click', () => openEditProfile(button.dataset.profileId)));
    document.querySelectorAll('.delete-profile').forEach((button) => button.addEventListener('click', () => {
        const id = button.dataset.profileId;
        if (!confirm(`¿Eliminar el QR de ${profiles[id]?.name || id}?`)) return;
        const updated = getProfiles();
        delete updated[id];
        localStorage.setItem(profilesKey, JSON.stringify(updated));
        queueCloudSync();
        renderProfiles();
        showToast('Usuario y QR eliminados.');
    }));
}
$('profile-search').addEventListener('input', renderProfiles);

loadCloudData();
