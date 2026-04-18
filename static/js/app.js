const volumeRange = document.getElementById('volumeRange');
const knobWrap = document.getElementById('knobWrap');
const knobFace = document.getElementById('knobFace');
const knobValue = document.getElementById('knobValue');
const volumeText = document.getElementById('volumeText');
const knobScale = document.getElementById('knobScale');
const powerButton = document.getElementById('powerButton');
const powerLed = document.getElementById('powerLed');
const powerLedText = document.getElementById('powerLedText');
const powerStatusText = document.getElementById('powerStatusText');
const knobCenterButton = document.getElementById('knobCenterButton');

let isPowerOn = false;
let isMuted = false;
let isDragging = false;
let volumeSendTimer = null;
let statusPollTimer = null;
let isSyncingStatus = false;
let lastUserVolumeChangeAt = 0;

const minVolume = Number(volumeRange?.min ?? 0);
const maxVolume = Number(volumeRange?.max ?? 80);
const STATUS_POLL_INTERVAL_MS = 3000;
const USER_INTERACTION_GRACE_MS = 1200;

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Tab hidden → stop polling');
        clearInterval(statusPollTimer);
    } else {
        console.log('Tab visible → resume polling');
        syncStatus();
        startStatusPolling();
    }
});

function updateInputUI(currentInput) {
    document.querySelectorAll('.mini-input-btn').forEach(btn => {
        const isActive = isPowerOn && btn.dataset.inputReceiver === String(currentInput);
        btn.classList.toggle('active', isActive);

        // Optional: disable buttons when power is off
        btn.disabled = !isPowerOn;
    });
}

function selectInput(receiverInput, userInputName) {
    if (!isPowerOn) return;

    updateInputUI(receiverInput);
    sendCommand(`input-selector ${receiverInput}`, `Input: ${userInputName}`);
    setTimeout(syncStatus, 400);
}

//function showToast(message, type = 'info', duration = 2500) {
//    const toastContainer = document.querySelector('.toast-container');
//    if (!toastContainer) return;
//
//    const toastId = 'toast-' + Date.now();
//
//    const icons = {
//        success: 'bi-check-circle-fill',
//        error: 'bi-exclamation-octagon-fill',
//        info: 'bi-info-circle-fill',
//        warning: 'bi-exclamation-triangle-fill'
//    };
//
//    const toastHTML = `
//        <div id="${toastId}" class="toast toast-${type}" role="alert" aria-live="assertive" aria-atomic="true">
//            <div class="toast-header bg-transparent border-0 text-white">
//                <i class="bi ${icons[type]} me-2"></i>
//                <strong class="me-auto text-capitalize">${type}</strong>
//                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
//            </div>
//            <div class="toast-body pt-0">${message}</div>
//        </div>
//    `;
//
//    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
//
//    const toastElement = document.getElementById(toastId);
//    const toast = new bootstrap.Toast(toastElement, {
//        autohide: true,
//        delay: duration
//    });
//
//    toast.show();
//
//    toastElement.addEventListener('hidden.bs.toast', () => {
//        toastElement.remove();
//    });
//}


function showToast(message, type = 'info', duration = 2500) {
    if (window.matchMedia('(max-width: 576px)').matches) {
        return;
    }

    const container = document.querySelector('.toast-container');
    if (!container) return;

    const id = 'toast-' + Date.now();

    const icons = {
        success: 'bi-check-circle-fill',
        error: 'bi-exclamation-octagon-fill',
        info: 'bi-info-circle-fill',
        warning: 'bi-exclamation-triangle-fill'
    };

    const toastHTML = `
        <div id="${id}" class="toast toast-${type}" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header bg-transparent border-0 text-white">
                <i class="bi ${icons[type]} me-2"></i>
                <strong class="me-auto text-capitalize">${type}</strong>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body pt-0">${message}</div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', toastHTML);

    const toastElement = document.getElementById(id);
    const toast = new bootstrap.Toast(toastElement, {
        autohide: true,
        delay: duration
    });

    toast.show();

    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

function sendCommand(command, successMessage = null) {
    console.log('Sending command:', command);

    fetch('/command', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command })
    })
    .then(response => {
        console.log('Response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('Response JSON:', data);

        if (data.status === 'success') {
            if (successMessage) {
                showToast(successMessage, 'success');
            }
        } else {
            showToast(data.message || 'Command failed', 'error', 4000);
        }
    })
    .catch(error => {
        console.error('Fetch error:', error);
        showToast(`Network error: ${error}`, 'error', 4000);
    });
}

function createKnobTicks() {
    if (!knobScale) return;

    knobScale.innerHTML = '';

    const totalTicks = 36;
    const startAngle = -135;
    const endAngle = 135;
    const step = (endAngle - startAngle) / (totalTicks - 1);

    for (let i = 0; i < totalTicks; i++) {
        const tick = document.createElement('div');
        tick.className = 'knob-tick';
        tick.style.transform = `translateX(-50%) rotate(${startAngle + (step * i)}deg)`;
        knobScale.appendChild(tick);
    }
}

function updateKnobUI(value) {
    if (!knobFace || !knobValue || !volumeText || !knobScale) return;

    const percentage = (value - minVolume) / (maxVolume - minVolume);
    const angle = -135 + (percentage * 270);

    knobFace.style.transform = `rotate(${angle}deg)`;
    knobValue.textContent = value;
    volumeText.textContent = value;

    const ticks = knobScale.querySelectorAll('.knob-tick');
    const activeCount = Math.round(percentage * ticks.length);

    ticks.forEach((tick, index) => {
        tick.classList.toggle('active', index < activeCount);
    });
}

function updateMuteUI(muted) {
    isMuted = muted;

    const icon = document.getElementById('muteIcon');

    if (knobCenterButton) {
        knobCenterButton.classList.toggle('muted', muted);
    }

    if (!icon) return;

    if (muted) {
        icon.className = 'bi bi-volume-mute-fill muted';
    } else {
        icon.className = 'bi bi-volume-up-fill';
    }
}

function setVolumeControlEnabled(enabled) {
    const volumeActions = document.querySelector('.volume-actions');

    if (knobWrap) {
        knobWrap.classList.toggle('knob-disabled', !enabled);
    }

    if (knobCenterButton) {
        knobCenterButton.disabled = !enabled;
    }

    if (volumeActions) {
        volumeActions.classList.toggle('disabled', !enabled);
    }
}

function scheduleVolumeSend(value) {
    clearTimeout(volumeSendTimer);
    volumeSendTimer = setTimeout(() => {
        sendVolume(value);
    }, 180);
}

function sendVolume(value) {
    sendCommand(`master-volume ${value}`);
}

function setVolume(value, shouldSend = true) {
    if (!volumeRange) return;

    const currentValue = Number(volumeRange.value);
    const newValue = Math.round(value);

    const delta = Math.abs(newValue - currentValue);

    // Ignore large jumps (>5) during interaction
    if (shouldSend && delta > 5) {
        console.warn('Ignored large volume jump:', currentValue, '→', newValue);
        return;
    }

    const safeValue = Math.max(minVolume, Math.min(maxVolume, newValue));

    volumeRange.value = safeValue;
    updateKnobUI(safeValue);

    if (shouldSend && isPowerOn) {
        lastUserVolumeChangeAt = Date.now();
        scheduleVolumeSend(safeValue);
    }
}

function adjustVolume(delta) {
    if (!isPowerOn || !volumeRange) return;
    lastUserVolumeChangeAt = Date.now();
    setVolume(Number(volumeRange.value) + delta, true);
}

function updatePowerUI(powerOn) {
    if (powerButton) {
        powerButton.classList.toggle('is-on', powerOn);
    }

    if (powerLed) {
        powerLed.classList.toggle('on', powerOn);
    }

    if (powerLedText) {
        powerLedText.textContent = powerOn ? 'Powered On' : 'Standby';
    }

    if (powerStatusText) {
        powerStatusText.textContent = powerOn ? 'On' : 'Off';
    }
}

function togglePower() {
    isPowerOn = !isPowerOn;

    const command = isPowerOn ? 'system-power on' : 'system-power off';
    const message = isPowerOn ? 'Receiver powered on' : 'Receiver powered off';

    updatePowerUI(isPowerOn);
    setVolumeControlEnabled(isPowerOn);
    sendCommand(command, message);

    // quick refresh shortly after sending
    setTimeout(syncStatus, 500);
}

//function toggleMute() {
//    if (!isPowerOn || !knobCenterButton) return;
//
//    const nextMuted = !isMuted;
//    updateMuteUI(nextMuted);
//    sendCommand('audio-muting toggle', nextMuted ? 'Muted' : 'Unmuted');
//
//    setTimeout(syncStatus, 400);
//}

function toggleMute() {
    if (!isPowerOn) return;

    const nextMuted = !isMuted;

    updateMuteUI(nextMuted);
    sendCommand('audio-muting toggle', nextMuted ? 'Muted' : 'Unmuted');

    setTimeout(syncStatus, 400);
}

function refreshPage() {
    location.reload();
}

function pointToVolume(clientX, clientY) {
    if (!knobWrap || !isPowerOn) return;

    const rect = knobWrap.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;

    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;

    if (angle > 180) angle -= 360;

    angle = Math.max(-135, Math.min(135, angle));

    const percentage = (angle + 135) / 270;
    const value = minVolume + percentage * (maxVolume - minVolume);

    lastUserVolumeChangeAt = Date.now();
    setVolume(value, true);
}

function normalizePower(value) {
    return value === 'on' || value === true || value === 1 || value === '1';
}

function normalizeMute(value) {
    return value === 'on' || value === true || value === 1 || value === '1';
}

function applyStatusToUI(data) {
    if (!data || typeof data !== 'object') return;

    const powerOn = normalizePower(data['system-power']);
    const muted = normalizeMute(data['audio-muting']);
    const volume = Number(data['master-volume']);

    isPowerOn = powerOn;
    updatePowerUI(powerOn);
    setVolumeControlEnabled(powerOn);
    updateMuteUI(muted);
    updateInputUI(data['input-selector']);

    const recentlyChangedVolume =
        isDragging || (Date.now() - lastUserVolumeChangeAt < USER_INTERACTION_GRACE_MS);

    if (!recentlyChangedVolume && Number.isFinite(volume)) {
        setVolume(volume, false);
    }
}

function syncStatus() {
    if (isSyncingStatus) return;

    isSyncingStatus = true;

    fetch('/status', {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        },
        cache: 'no-store'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    })
    .then(payload => {
        console.log('Status payload:', payload);

        if (payload.status === 'success' && payload.data) {
            applyStatusToUI(payload.data);
        } else {
            console.warn('Unexpected /status payload:', payload);
        }
    })
    .catch(error => {
        console.error('Status sync error:', error);
    })
    .finally(() => {
        isSyncingStatus = false;
    });
}

function startStatusPolling() {
    if (statusPollTimer) {
        clearInterval(statusPollTimer);
    }

    statusPollTimer = setInterval(() => {
        syncStatus();
    }, STATUS_POLL_INTERVAL_MS);
}

if (knobWrap) {
    knobWrap.addEventListener('mousedown', (e) => {
        if (!isPowerOn) return;
        if (knobCenterButton && (e.target === knobCenterButton || knobCenterButton.contains(e.target))) {
            return;
        }

        isDragging = true;
        pointToVolume(e.clientX, e.clientY);
    });

    knobWrap.addEventListener('wheel', (e) => {
        if (!isPowerOn) return;

        e.preventDefault();
        adjustVolume(e.deltaY > 0 ? -1 : 1);
    }, { passive: false });

    knobWrap.addEventListener('touchstart', (e) => {
        if (!isPowerOn) return;
        if (knobCenterButton && (e.target === knobCenterButton || knobCenterButton.contains(e.target))) {
            return;
        }

        isDragging = true;
        const touch = e.touches[0];
        pointToVolume(touch.clientX, touch.clientY);
    }, { passive: true });
}

document.addEventListener('mousemove', (e) => {
    if (!isDragging || !isPowerOn) return;
    pointToVolume(e.clientX, e.clientY);
});

document.addEventListener('mouseup', () => {
    isDragging = false;
});

document.addEventListener('touchmove', (e) => {
    if (!isDragging || !isPowerOn) return;
    const touch = e.touches[0];
    pointToVolume(touch.clientX, touch.clientY);
}, { passive: true });

document.addEventListener('touchend', () => {
    isDragging = false;
});

if (volumeRange) {
    volumeRange.addEventListener('input', (e) => {
        if (!isPowerOn) return;
        lastUserVolumeChangeAt = Date.now();
        setVolume(Number(e.target.value), true);
    });
}

if (knobCenterButton) {
    knobCenterButton.addEventListener('click', () => {
        toggleMute();
    });
}

window.addEventListener('load', () => {
    createKnobTicks();

    const initialVolume = window.APP_CONFIG?.initialVolume ?? 35;
    const initialPower = window.APP_CONFIG?.initialPower ?? false;

    setVolume(initialVolume, false);
    isPowerOn = initialPower;
    updatePowerUI(initialPower);
    setVolumeControlEnabled(initialPower);
    updateMuteUI(false);

    syncStatus();
    startStatusPolling();

    if (document.body.innerHTML.includes('Connected')) {
        showToast('Device connected', 'success', 2200);
    } else {
        showToast('Device not available', 'warning', 3500);
    }
});
