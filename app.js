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
        $('scanner-message').textContent = 'Apunta la cámara al código QR y acércalo un poco.';
    } catch (error) {
        try { await state.scanner.clear(); } catch (clearError) { /* lector ya detenido */ }
        state.scanner = null;
        $('reader').innerHTML = '<div class="reader-placeholder"><span>⌁</span><p>La cámara aparecerá aquí</p></div>';
        $('scanner-message').textContent = 'No se pudo abrir la cámara. Revisa el permiso del navegador y usa HTTPS.';
        $('start-scanner').disabled = false;
        $('start-scanner').textContent = 'Activar cámara';
    }
}
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
    const countLine = state.movement === 'Salida'
        ? `<br>Socio<br>Socio nuevo<br>Libre<br>Cartilla nueva<br>Cartilla renovad`
        : '';
    $('attendance-summary').innerHTML = `<b>${state.user.name}</b><br>${state.movement} · ${localDate()}${countLine}`;
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
        state.user.name,
        `${state.user.id} · ${state.movement}`,
        localDate()
    ];
    const counts = getExitCounts();
    if (state.movement === 'Salida' && hasExitCounts(counts)) {
        lines.push(`Socio: ${counts.oldMembers || 0} · Socio nuevo: ${counts.newMembers || 0}`);
        lines.push(`Libre: ${counts.freeCount || 0}`);
        lines.push(`Cartillas nuevas: ${counts.newCards || 0} · Renovadas: ${counts.renewedCards || 0}`);
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
    const userSnapshot = state.user || { id: 'usuario', name: 'Usuario' };
    records.unshift({ ...userSnapshot, movement: state.movement, date: localDate(), sent });
    localStorage.setItem(historyKey, JSON.stringify(records.slice(0, 100)));
}

async function sendToTelegram(photo) {
    const counts = getExitCounts();
    const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo, user: state.user, movement: state.movement, date: localDate(), ...counts })
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
    $('qr-name').value = name;
    $('qr-id').value = id;
    $('qr-area').value = area;
    $('download-qr').disabled = false;
    $('generator-message').textContent = 'Código creado correctamente.';
    state.qrPhoto = '';
    $('qr-photo').value = '';
    $('qr-photo-preview').classList.add('hidden');
});
$('download-qr').addEventListener('click', () => {
    const image = $('qrcode').querySelector('img') || $('qrcode').querySelector('canvas');
    if (!image) return;
    const name = $('qr-result-name').textContent.trim() || $('qr-name').value.trim();
    const id = $('qr-result-id').textContent.split(' · ')[0].trim() || $('qr-id').value.trim();
    const qrCanvas = document.createElement('canvas');
    qrCanvas.width = 320;
    qrCanvas.height = 370;
    const context = qrCanvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, qrCanvas.width, qrCanvas.height);

    const drawCard = () => {
        const source = image.tagName === 'CANVAS' ? image : image;
        context.drawImage(source, 60, 24, 200, 200);
        context.fillStyle = '#172033';
        context.textAlign = 'center';
        context.font = '700 22px Arial, sans-serif';
        context.fillText('Nombre', qrCanvas.width / 2, 270);
        context.font = '600 20px Arial, sans-serif';
        context.fillText(name.slice(0, 28), qrCanvas.width / 2, 300);
        context.font = '700 22px Arial, sans-serif';
        context.fillText('DNI', qrCanvas.width / 2, 335);
        context.font = '600 20px Arial, sans-serif';
        context.fillText(id.slice(0, 28), qrCanvas.width / 2, 360);
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
        text: JSON.stringify({ name: profile.name, id, area: profile.area || '' }),
        width: 200,
        height: 200,
        colorDark: '#172033',
        colorLight: '#ffffff'
    });
    $('qr-result-name').textContent = profile.name;
    $('qr-result-id').textContent = `${id}${profile.area ? ` · ${profile.area}` : ''}`;
    $('qr-name').value = profile.name || '';
    $('qr-id').value = id;
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
    const area = $('edit-profile-area').value.trim();
    if (!name || !id) {
        $('edit-profile-message').textContent = 'Escribe el nombre y el ID.';
        return;
    }
    const profiles = getProfiles();
    if (id !== originalId && profiles[id]) {
        $('edit-profile-message').textContent = 'Ese ID ya existe.';
        return;
    }
    const save = (photo) => {
        const updated = { name, area, photo: photo || profiles[originalId].photo || '' };
        if (id !== originalId) delete profiles[originalId];
        profiles[id] = updated;
        localStorage.setItem(profilesKey, JSON.stringify(profiles));
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

function renderHistory() {
    const records = JSON.parse(localStorage.getItem(historyKey) || '[]');
    $('empty-history').classList.toggle('hidden', records.length > 0);
    $('history-body').innerHTML = records.map((item) => `<tr><td><b>${item.name}</b><br><small>${item.id}</small></td><td>${item.movement}</td><td>${item.date}</td><td>${item.sent ? '<span class="sent">Enviado</span>' : '<span class="pending">Pendiente</span>'}</td></tr>`).join('');
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
        renderProfiles();
        showToast('Usuario y QR eliminados.');
    }));
}
$('profile-search').addEventListener('input', renderProfiles);
