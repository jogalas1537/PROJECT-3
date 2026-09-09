/* ==========================================================
   CrowdFlow AI — CCTV Backend Connected Application Logic
   ========================================================== */

(() => {
    'use strict';

    /* ---------- DOM Refs ---------- */
    const videoUpload = document.getElementById('videoUpload');
    const videoEl = document.getElementById('crowdVideo');
    const canvas = document.getElementById('detectionCanvas');
    const ctx = canvas.getContext('2d');
    const uploadMessage = document.getElementById('uploadMessage');
    const cameraSelect = document.getElementById('cameraSelect');

    const peopleEl = document.getElementById('people');
    const densityEl = document.getElementById('density');
    const riskEl = document.getElementById('risk');
    const crowdAlertEl = document.getElementById('crowdAlert');
    const recommendedActionEl = document.getElementById('recommendedAction');
    const activeGatesEl = document.getElementById('activeGates');

    const zoneIds = ['A', 'B', 'C', 'D'];
    const zoneEls = {};
    zoneIds.forEach(id => {
        zoneEls[id] = {
            count: document.getElementById('zone' + id),
            risk: document.getElementById('zone' + id + 'Risk'),
            reason: document.getElementById('zone' + id + 'Reason'),
            prediction: document.getElementById('zone' + id + 'Prediction'),
            card: document.getElementById('zone' + id)?.closest('.zone-card')
        };
    });
    const highestRiskZoneEl = document.getElementById('highestRiskZone');

    const heatmapCanvas = document.getElementById('heatmapCanvas');
    const heatCtx = heatmapCanvas.getContext('2d');

    const movementStatusEl = document.getElementById('movementStatus');
    const flowDirectionEl = document.getElementById('flowDirection');
    const congestionForecastEl = document.getElementById('congestionForecast');
    const flowWarningEl = document.getElementById('flowWarning');

    const gateIds = ['A', 'B', 'C', 'D'];
    const gateEls = {};
    gateIds.forEach(id => {
        gateEls[id] = {
            status: document.getElementById('gate' + id + 'Status'),
            action: document.getElementById('gate' + id + 'Action'),
            card: document.getElementById('gate' + id + 'Status')?.closest('.gate-status-card')
        };
    });

    const simulationSlider = document.getElementById('simulationPeople');
    const simulationValueEl = document.getElementById('simulationValue');
    const simulatedCrowdEl = document.getElementById('simulatedCrowd');
    const simulatedRiskEl = document.getElementById('simulatedRisk');
    const simulationAdviceEl = document.getElementById('simulationAdvice');

    const spaceAreaInput = document.getElementById('spaceArea');
    const areaUnitSelect = document.getElementById('areaUnit');
    const densityStandardSelect = document.getElementById('densityStandard');
    const capacitySourceSelect = document.getElementById('capacitySource');
    const capacityBarFill = document.getElementById('capacityBarFill');
    const capacityCurrentCountEl = document.getElementById('capacityCurrentCount');
    const capacityMaxCountEl = document.getElementById('capacityMaxCount');
    const capacityStatusEl = document.getElementById('capacityStatus');
    const capacityExplanationEl = document.getElementById('capacityExplanation');

    const trendCanvas = document.getElementById('trendCanvas');
    const trendCtx = trendCanvas.getContext('2d');
    const trendPeakInlineEl = document.getElementById('trendPeakInline');
    const trendCurrentInlineEl = document.getElementById('trendCurrentInline');

    const surgeAlertEl = document.getElementById('surgeAlert');

    const evacTimeEl = document.getElementById('evacTime');
    const evacDetailEl = document.getElementById('evacDetail');
    const evacOpenGatesEl = document.getElementById('evacOpenGates');
    const evacThroughputEl = document.getElementById('evacThroughput');
    const staffTotalEl = document.getElementById('staffTotal');
    const staffStewardsEl = document.getElementById('staffStewards');
    const staffMedicalEl = document.getElementById('staffMedical');

    const reportDurationEl = document.getElementById('reportDuration');
    const reportPeakEl = document.getElementById('reportPeak');
    const reportAverageEl = document.getElementById('reportAverage');
    const exportReportBtn = document.getElementById('exportReportBtn');

    const emergencyStatusEl = document.getElementById('emergencyStatus');
    const emergencyReasonEl = document.getElementById('emergencyReason');
    const emergencyActionEl = document.getElementById('emergencyAction');

    const safetyScoreEl = document.getElementById('safetyScore');
    const safetyStatusEl = document.getElementById('safetyStatus');
    const safetyExplanationEl = document.getElementById('safetyExplanation');

    const recommendationTitleEl = document.getElementById('recommendationTitle');
    const recommendationTextEl = document.getElementById('recommendationText');

    const eventHistoryEl = document.getElementById('eventHistory');

    /* ---------- State ---------- */
    let detecting = false;
    let isProcessingFrame = false;
    let lastPeopleCount = 0;
    let lastRiskLevel = 'LOW';
    let lastCapacityTone = null;
    let gateStatuses = { A: 'NORMAL', B: 'NORMAL', C: 'NORMAL', D: 'NORMAL' };

    let trendData = [];
    let lastTrendSampleTime = 0;
    const TREND_SAMPLE_INTERVAL_MS = 1000;
    const TREND_MAX_POINTS = 90;
    let trendW = 0, trendH = 0;

    let countWindow = [];
    const SURGE_WINDOW_MS = 6000;
    const SURGE_ABS_THRESHOLD = 8;
    const SURGE_PCT_THRESHOLD = 0.6;
    let surgeActive = false;

    const sessionStart = Date.now();
    let lastFrameTimestamp = Date.now();
    let peakCount = 0;
    let countSum = 0;
    let countSamples = 0;
    const riskTimeMs = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    let zoneCounts = { A: 0, B: 0, C: 0, D: 0 };
    let prevZoneCounts = { A: 0, B: 0, C: 0, D: 0 };
    let centroidHistory = [];
    const HISTORY_LEN = 8;

    /* ---------- Thresholds & Ratios ---------- */
    const RISK_THRESHOLDS = { LOW: 15, MEDIUM: 40, HIGH: 80 };
    const RISK_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const RISK_META = {
        LOW: { class: 'safe', badge: 'low', label: '🟢 CROWD LEVEL: LOW' },
        MEDIUM: { class: 'caution', badge: 'medium', label: '🟡 CROWD LEVEL: MEDIUM' },
        HIGH: { class: 'warning', badge: 'high', label: '🟠 CROWD LEVEL: HIGH' },
        CRITICAL: { class: 'critical', badge: 'critical', label: '🔴 CROWD LEVEL: CRITICAL' }
    };

    const SQFT_TO_SQM = 0.092903;
    const GATE_THROUGHPUT = { NORMAL: 60, CAUTION: 45, RESTRICTED: 25, CLOSED: 0 };
    const STEWARD_RATIO = { LOW: 100, MEDIUM: 75, HIGH: 50, CRITICAL: 25 };
    const MEDICAL_RATIO = { LOW: 500, MEDIUM: 350, HIGH: 200, CRITICAL: 100 };

    /* ---------- Helpers ---------- */
    function riskFromCount(count) {
        if (count <= RISK_THRESHOLDS.LOW) return 'LOW';
        if (count <= RISK_THRESHOLDS.MEDIUM) return 'MEDIUM';
        if (count <= RISK_THRESHOLDS.HIGH) return 'HIGH';
        return 'CRITICAL';
    }

    function densityFromCount(count) {
        if (count <= 20) return 'Low';
        if (count <= 50) return 'Medium';
        return 'High';
    }

    function logEvent(label, detail, tone = '') {
        const item = document.createElement('div');
        item.className = 'history-item' + (tone ? ' event-' + tone : '');
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        item.innerHTML = `<span>${time} · ${label}</span><strong>${detail}</strong>`;
        eventHistoryEl.appendChild(item);
        while (eventHistoryEl.children.length > 40) {
            eventHistoryEl.removeChild(eventHistoryEl.firstChild);
        }
    }

    /* ---------- Video Upload & Setup ---------- */
    videoUpload.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        videoEl.crossOrigin = 'anonymous'; // Prevent canvas security taints
        const url = URL.createObjectURL(file);
        videoEl.src = url;
        uploadMessage.classList.add('hidden');
        videoEl.style.display = 'block';

        logEvent('Upload', `Loaded "${file.name}"`, 'safe');
        videoEl.play().catch(err => console.error('Autoplay error:', err));
    });

    videoEl.addEventListener('loadedmetadata', resizeCanvas);
    window.addEventListener('resize', resizeCanvas);

    function resizeCanvas() {
        if (videoEl.videoWidth && videoEl.videoHeight) {
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
        }
    }

    videoEl.addEventListener('play', () => {
        resizeCanvas();
        if (!detecting) {
            detecting = true;
            detectLoop();
        }
    });

    videoEl.addEventListener('pause', () => { detecting = false; });
    videoEl.addEventListener('ended', () => { detecting = false; });

    /* ---------- Resilient Inference Loop ---------- */
    async function detectLoop() {
        if (!detecting || videoEl.paused || videoEl.ended) return;

        const vw = videoEl.videoWidth || videoEl.clientWidth;
        const vh = videoEl.videoHeight || videoEl.clientHeight;

        if (!isProcessingFrame && vw > 0 && vh > 0) {
            isProcessingFrame = true;

            try {
                // Ensure canvas matches video size
                if (canvas.width !== vw || canvas.height !== vh) {
                    canvas.width = vw;
                    canvas.height = vh;
                }

                // Off-screen frame extraction
                const offscreenCanvas = document.createElement('canvas');
                offscreenCanvas.width = vw;
                offscreenCanvas.height = vh;
                const offCtx = offscreenCanvas.getContext('2d');
                offCtx.drawImage(videoEl, 0, 0, vw, vh);

                const frameData = offscreenCanvas.toDataURL('image/jpeg', 0.5);

                const response = await fetch('http://127.0.0.1:5000/process_frame', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: frameData })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.detections) {
                        handleDetections(data.detections);
                    }
                } else {
                    console.warn('Backend returned non-200 status code:', response.status);
                }
            } catch (err) {
                console.error('Frame extraction or Backend Fetch Error:', err);
            } finally {
                isProcessingFrame = false; // Always release lock
            }
        }

        if (detecting) {
            setTimeout(detectLoop, 150); // Poll every 150ms
        }
    }

    /* ---------- Detections Handler ---------- */
    function handleDetections(people) {
        drawBoxes(people);

        const count = people.length;
        peopleEl.textContent = count;

        const counts = { A: 0, B: 0, C: 0, D: 0 };
        const vw = videoEl.videoWidth || 1;
        const vh = videoEl.videoHeight || 1;
        const centroidsX = [];

        decayHeatGrid();

        people.forEach(p => {
            const [x, y, w, h] = p.bbox;
            const cx = (x + w / 2) / vw;
            const cy = (y + h / 2) / vh;
            centroidsX.push(cx);

            if (cx < 0.5 && cy < 0.5) counts.A++;
            else if (cx >= 0.5 && cy < 0.5) counts.B++;
            else if (cx < 0.5 && cy >= 0.5) counts.C++;
            else counts.D++;

            addHeatPoint(cx, cy);
        });

        prevZoneCounts = zoneCounts;
        zoneCounts = counts;

        if (centroidsX.length) {
            const avgX = centroidsX.reduce((a, b) => a + b, 0) / centroidsX.length;
            centroidHistory.push(avgX);
            if (centroidHistory.length > HISTORY_LEN) centroidHistory.shift();
        }

        updateAnalytics(count);
        updateZones();
        updateHeatmap();
        updateFlow();
        updateGates();
        updateSafetyAndEmergency(count);
        updateRecommendation(count);

        lastPeopleCount = count;
        updateCapacityCheck();
        updateOperationsPlan();
        sampleTrend(count);
        checkSurge(count);
        updateReportStats();
    }

    /* ---------- Draw Bounding Boxes ---------- */
    function drawBoxes(people) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!canvas.width || !canvas.height) return;

        ctx.lineWidth = 2;
        ctx.font = '12px "Space Mono", monospace';

        people.forEach(p => {
            const [x, y, w, h] = p.bbox;

            ctx.strokeStyle = '#45E4FF';
            ctx.strokeRect(x, y, w, h);

            const label = `PERSON ${Math.round(p.score * 100)}%`;
            const textW = ctx.measureText(label).width + 8;
            ctx.fillStyle = 'rgba(10, 7, 22, 0.85)';
            ctx.fillRect(x, Math.max(0, y - 18), textW, 18);
            ctx.fillStyle = '#45E4FF';
            ctx.fillText(label, x + 4, Math.max(13, y - 4));
        });
    }

    /* ---------- Top-Level Analytics ---------- */
    function updateAnalytics(count) {
        densityEl.textContent = densityFromCount(count);

        const risk = riskFromCount(count);
        riskEl.textContent = risk;

        const now = Date.now();
        const dt = now - lastFrameTimestamp;
        lastFrameTimestamp = now;
        riskTimeMs[risk] += dt;
        peakCount = Math.max(peakCount, count);
        countSum += count;
        countSamples++;

        const meta = RISK_META[risk];
        const riskCard = riskEl.closest('.card');
        if (riskCard) riskCard.className = 'card status-' + meta.class;

        crowdAlertEl.className = 'crowd-alert ' + meta.badge;
        crowdAlertEl.textContent = meta.label;

        const gateCountByRisk = { LOW: 2, MEDIUM: 4, HIGH: 6, CRITICAL: 8 };
        activeGatesEl.textContent = gateCountByRisk[risk];

        const actionByRisk = {
            LOW: 'Continue monitoring the crowd.',
            MEDIUM: 'Increase patrol presence at high-traffic zones.',
            HIGH: 'Open additional gates and stage crowd control teams.',
            CRITICAL: 'Halt entry and activate emergency dispersal plan.'
        };
        recommendedActionEl.textContent = actionByRisk[risk];

        if (risk !== lastRiskLevel) {
            const tone = risk === 'CRITICAL' ? 'critical' : risk === 'HIGH' ? 'warning' : risk === 'LOW' ? 'safe' : '';
            logEvent('Risk Level', `Changed to ${risk} (${count} detected)`, tone);
            lastRiskLevel = risk;
        }
    }

    /* ---------- Zone Intelligence ---------- */
    const ZONE_REASONS = {
        LOW: 'Crowd density within normal range.',
        MEDIUM: 'Moderate density — worth watching.',
        HIGH: 'Density climbing — consider redirecting flow.',
        CRITICAL: 'Overcrowded — immediate action recommended.'
    };

    function updateZones() {
        let topZone = null;
        let topRiskIdx = -1;

        zoneIds.forEach(id => {
            const count = zoneCounts[id];
            const prevCount = prevZoneCounts[id] || 0;
            const risk = riskFromCount(count * 2.5);

            const els = zoneEls[id];
            if (!els.count) return;

            els.count.textContent = count;
            els.risk.textContent = risk;
            els.risk.className = RISK_META[risk].badge;
            els.reason.textContent = ZONE_REASONS[risk];

            let trend = 'holding steady';
            if (count > prevCount) trend = 'trending up';
            else if (count < prevCount) trend = 'trending down';
            els.prediction.textContent = `Prediction: ${trend}`;

            if (els.card) {
                els.card.style.borderLeft = '3px solid var(--' +
                    (RISK_META[risk].class === 'safe' ? 'safe' :
                     RISK_META[risk].class === 'caution' ? 'caution' :
                     RISK_META[risk].class === 'warning' ? 'warning' : 'critical') + ')';
            }

            const riskIdx = RISK_ORDER.indexOf(risk);
            if (riskIdx > topRiskIdx || (riskIdx === topRiskIdx && count > (zoneCounts[topZone] || -1))) {
                topRiskIdx = riskIdx;
                topZone = id;
            }
        });

        if (topZone) {
            highestRiskZoneEl.textContent = `Zone ${topZone} (${RISK_ORDER[topRiskIdx]})`;
        }
    }

    /* ---------- Heatmap Canvas ---------- */
    const HEAT_COLS = 22;
    const HEAT_ROWS = 10;
    const HEAT_DECAY = 0.93;
    const HEAT_CELL_CAP = 4;
    let heatGrid = new Float32Array(HEAT_COLS * HEAT_ROWS);
    let heatW = 0, heatH = 0;

    const HEAT_STOPS = [
        { t: 0.00, c: [58, 84, 168] },
        { t: 0.28, c: [69, 196, 228] },
        { t: 0.52, c: [52, 240, 166] },
        { t: 0.76, c: [255, 209, 102] },
        { t: 1.00, c: [255, 61, 119] }
    ];

    function heatColor(t) {
        t = Math.max(0, Math.min(1, t));
        for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
            const a = HEAT_STOPS[i], b = HEAT_STOPS[i + 1];
            if (t >= a.t && t <= b.t) {
                const local = (t - a.t) / (b.t - a.t || 1);
                const r = Math.round(a.c[0] + (b.c[0] - a.c[0]) * local);
                const g = Math.round(a.c[1] + (b.c[1] - a.c[1]) * local);
                const bC = Math.round(a.c[2] + (b.c[2] - a.c[2]) * local);
                return [r, g, bC];
            }
        }
        return HEAT_STOPS[HEAT_STOPS.length - 1].c;
    }

    function decayHeatGrid() {
        for (let i = 0; i < heatGrid.length; i++) {
            heatGrid[i] *= HEAT_DECAY;
            if (heatGrid[i] < 0.02) heatGrid[i] = 0;
        }
    }

    function addHeatPoint(x, y) {
        const col = Math.max(0, Math.min(HEAT_COLS - 1, Math.floor(x * HEAT_COLS)));
        const row = Math.max(0, Math.min(HEAT_ROWS - 1, Math.floor(y * HEAT_ROWS)));
        const bump = (c, r, amount) => {
            if (c < 0 || c >= HEAT_COLS || r < 0 || r >= HEAT_ROWS) return;
            const idx = r * HEAT_COLS + c;
            heatGrid[idx] = Math.min(HEAT_CELL_CAP, heatGrid[idx] + amount);
        };
        bump(col, row, 1);
        bump(col - 1, row, 0.35);
        bump(col + 1, row, 0.35);
        bump(col, row - 1, 0.35);
        bump(col, row + 1, 0.35);
    }

    function sizeHeatmapCanvas() {
        const rect = heatmapCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        heatW = rect.width;
        heatH = rect.height;
        heatmapCanvas.width = Math.max(1, Math.round(heatW * dpr));
        heatmapCanvas.height = Math.max(1, Math.round(heatH * dpr));
        heatCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', sizeHeatmapCanvas);
    sizeHeatmapCanvas();

    function updateHeatmap() {
        if (!heatW) sizeHeatmapCanvas();
        heatCtx.clearRect(0, 0, heatW, heatH);

        const cellW = heatW / HEAT_COLS;
        const cellH = heatH / HEAT_ROWS;

        heatCtx.strokeStyle = 'rgba(255,255,255,0.05)';
        heatCtx.lineWidth = 1;
        for (let c = 0; c <= HEAT_COLS; c++) {
            heatCtx.beginPath();
            heatCtx.moveTo(c * cellW, 0);
            heatCtx.lineTo(c * cellW, heatH);
            heatCtx.stroke();
        }
        for (let r = 0; r <= HEAT_ROWS; r++) {
            heatCtx.beginPath();
            heatCtx.moveTo(0, r * cellH);
            heatCtx.lineTo(heatW, r * cellH);
            heatCtx.stroke();
        }

        for (let r = 0; r < HEAT_ROWS; r++) {
            for (let c = 0; c < HEAT_COLS; c++) {
                const v = heatGrid[r * HEAT_COLS + c];
                if (v <= 0) continue;
                const norm = Math.min(v / HEAT_CELL_CAP, 1);
                const [rr, gg, bb] = heatColor(norm);
                const alpha = 0.22 + norm * 0.62;
                const x = c * cellW + 1;
                const y = r * cellH + 1;
                const w = Math.max(0, cellW - 2);
                const h = Math.max(0, cellH - 2);
                heatCtx.fillStyle = `rgba(${rr}, ${gg}, ${bb}, ${alpha})`;
                if (heatCtx.roundRect) {
                    heatCtx.beginPath();
                    heatCtx.roundRect(x, y, w, h, 3);
                    heatCtx.fill();
                } else {
                    heatCtx.fillRect(x, y, w, h);
                }
            }
        }

        heatCtx.strokeStyle = 'rgba(255,255,255,0.14)';
        heatCtx.setLineDash([5, 5]);
        heatCtx.beginPath();
        heatCtx.moveTo(heatW / 2, 0);
        heatCtx.lineTo(heatW / 2, heatH);
        heatCtx.moveTo(0, heatH / 2);
        heatCtx.lineTo(heatW, heatH / 2);
        heatCtx.stroke();
        heatCtx.setLineDash([]);
    }

    /* ---------- Flow Analytics ---------- */
    function updateFlow() {
        const total = zoneCounts.A + zoneCounts.B + zoneCounts.C + zoneCounts.D;
        const prevTotal = prevZoneCounts.A + prevZoneCounts.B + prevZoneCounts.C + prevZoneCounts.D;
        const delta = total - prevTotal;

        let movement = 'Stable';
        if (delta > 2) movement = 'Building';
        else if (delta < -2) movement = 'Dispersing';
        movementStatusEl.textContent = movement;

        let direction = '--';
        if (centroidHistory.length >= 2) {
            const first = centroidHistory[0];
            const last = centroidHistory[centroidHistory.length - 1];
            const diff = last - first;
            if (Math.abs(diff) < 0.03) direction = 'Stationary';
            else direction = diff > 0 ? 'Drifting toward Zones B / D' : 'Drifting toward Zones A / C';
        }
        flowDirectionEl.textContent = direction;

        const risk = riskFromCount(total);
        const forecastByRisk = { LOW: 'Low', MEDIUM: 'Moderate', HIGH: 'Elevated', CRITICAL: 'Severe' };
        congestionForecastEl.textContent = forecastByRisk[risk];

        flowWarningEl.classList.remove('active', 'critical');
        if (risk === 'CRITICAL') {
            flowWarningEl.textContent = 'Severe congestion forecast — bottleneck likely within minutes.';
            flowWarningEl.classList.add('critical');
        } else if (risk === 'HIGH') {
            flowWarningEl.textContent = 'Congestion building — monitor bottleneck points closely.';
            flowWarningEl.classList.add('active');
        } else {
            flowWarningEl.textContent = 'No congestion detected.';
        }
    }

    /* ---------- Gate Operations ---------- */
    const ZONE_TO_GATE = { A: 'A', B: 'B', C: 'C', D: 'D' };

    function updateGates() {
        gateIds.forEach(id => {
            const zoneCount = zoneCounts[ZONE_TO_GATE[id]] || 0;
            const risk = riskFromCount(zoneCount * 2.5);
            const els = gateEls[id];
            if (!els.status) return;

            const statusByRisk = { LOW: 'NORMAL', MEDIUM: 'CAUTION', HIGH: 'RESTRICTED', CRITICAL: 'CLOSED' };
            const actionByRisk = {
                LOW: 'Normal operation',
                MEDIUM: 'Monitor entry rate',
                HIGH: 'Metering entry — staff advised',
                CRITICAL: 'Gate closed — redirect to alternate entry'
            };
            const classByRisk = { LOW: '', MEDIUM: 'caution', HIGH: 'warning', CRITICAL: 'critical' };

            els.status.textContent = statusByRisk[risk];
            els.action.textContent = actionByRisk[risk];
            gateStatuses[id] = statusByRisk[risk];
            if (els.card) {
                els.card.className = 'gate-status-card' + (classByRisk[risk] ? ' ' + classByRisk[risk] : '');
            }
        });
    }

    /* ---------- Safety Score & Emergency Logic ---------- */
    function updateSafetyAndEmergency(count) {
        const risk = riskFromCount(count);
        const zoneValues = Object.values(zoneCounts);
        const maxZone = Math.max(...zoneValues, 0);
        const minZone = Math.min(...zoneValues, 0);
        const imbalance = maxZone - minZone;

        let score = 100;
        if (risk === 'MEDIUM') score -= 20;
        if (risk === 'HIGH') score -= 45;
        if (risk === 'CRITICAL') score -= 70;
        score -= Math.min(imbalance * 2, 15);
        score = Math.max(0, Math.min(100, Math.round(score)));

        safetyScoreEl.textContent = score;
        safetyScoreEl.style.setProperty('--pct', score);
        const scoreClass = score >= 80 ? '' : score >= 55 ? 'caution' : score >= 30 ? 'warning' : 'critical';
        safetyScoreEl.className = 'score-circle' + (scoreClass ? ' ' + scoreClass : '');

        const statusText = score >= 80 ? 'SAFE' : score >= 55 ? 'CAUTION' : score >= 30 ? 'ELEVATED RISK' : 'CRITICAL';
        safetyStatusEl.textContent = statusText;

        const explanationByStatus = {
            'SAFE': 'Crowd conditions are currently stable.',
            'CAUTION': 'Density is rising in one or more zones. Keep watching.',
            'ELEVATED RISK': 'Multiple indicators show strain on capacity.',
            'CRITICAL': 'Conditions indicate a credible safety risk.'
        };
        safetyExplanationEl.textContent = explanationByStatus[statusText];

        let emStatus = 'normal';
        let emLabel = 'SYSTEM STATUS: NORMAL';
        let emReason = 'No immediate emergency indicators detected.';
        let emAction = 'Continue monitoring.';

        if (risk === 'CRITICAL' && imbalance > 8) {
            emStatus = 'critical';
            emLabel = 'SYSTEM STATUS: CRITICAL';
            emReason = `Crowd density has exceeded safe capacity with severe imbalance across zones (peak zone at ${maxZone} detections).`;
            emAction = 'Trigger emergency dispersal protocol and alert on-site security immediately.';
        } else if (risk === 'CRITICAL') {
            emStatus = 'severe';
            emLabel = 'SYSTEM STATUS: SEVERE';
            emReason = `Crowd count (${count}) has exceeded critical threshold.`;
            emAction = 'Halt new entries and deploy additional staff to affected zones.';
        } else if (risk === 'HIGH') {
            emStatus = 'elevated';
            emLabel = 'SYSTEM STATUS: ELEVATED';
            emReason = 'Crowd density is approaching capacity limits.';
            emAction = 'Prepare contingency gates and notify duty manager.';
        }

        emergencyStatusEl.className = 'emergency-status ' + emStatus;
        emergencyStatusEl.textContent = emLabel;
        emergencyReasonEl.textContent = emReason;
        emergencyActionEl.textContent = emAction;

        if (emStatus === 'critical' && emergencyStatusEl.dataset.lastStatus !== 'critical') {
            logEvent('Emergency Engine', 'CRITICAL status triggered', 'critical');
        }
        emergencyStatusEl.dataset.lastStatus = emStatus;
    }

    /* ---------- AI Recommendation Card ---------- */
    function updateRecommendation(count) {
        const risk = riskFromCount(count);
        const titleByRisk = {
            LOW: 'Monitoring Crowd Flow',
            MEDIUM: 'Watch for Rising Density',
            HIGH: 'Prepare Crowd Control Measures',
            CRITICAL: 'Act Now — Capacity Exceeded'
        };
        const textByRisk = {
            LOW: 'Crowd levels are normal. Continue passive monitoring across all zones.',
            MEDIUM: 'Density is increasing in at least one zone. Consider positioning staff near likely bottlenecks.',
            HIGH: 'Multiple zones are approaching capacity. Open additional gates and begin active crowd management.',
            CRITICAL: 'Crowd density has exceeded safe limits. Halt entry, open all available exits, and follow the emergency dispersal plan.'
        };
        recommendationTitleEl.textContent = titleByRisk[risk];
        recommendationTextEl.textContent = textByRisk[risk];
    }

    /* ---------- Simulator Controls ---------- */
    function runSimulation() {
        const extra = parseInt(simulationSlider.value, 10) || 0;
        simulationValueEl.textContent = `+${extra} people`;

        const base = lastPeopleCount;
        const predicted = base + extra;
        simulatedCrowdEl.textContent = predicted;

        const risk = riskFromCount(predicted);
        simulatedRiskEl.textContent = risk;
        simulatedRiskEl.className = '';
        simulatedRiskEl.style.color = `var(--${RISK_META[risk].class === 'safe' ? 'safe' : RISK_META[risk].class === 'caution' ? 'caution' : RISK_META[risk].class === 'warning' ? 'warning' : 'critical'})`;

        const adviceByRisk = {
            LOW: extra === 0 ? 'No additional crowd simulated.' : 'Venue can comfortably absorb this increase.',
            MEDIUM: 'Approaching moderate density — plan for extra staffing.',
            HIGH: 'This increase would strain current gate capacity. Recommend opening reserve gates in advance.',
            CRITICAL: 'This increase would exceed safe capacity. Recommend capping entry before reaching this level.'
        };
        simulationAdviceEl.textContent = adviceByRisk[risk];
        updateCapacityCheck();
        updateOperationsPlan();
    }

    simulationSlider.addEventListener('input', runSimulation);
    runSimulation();

    /* ---------- Capacity Check ---------- */
    function computeAreaSqm() {
        const raw = parseFloat(spaceAreaInput.value) || 0;
        return areaUnitSelect.value === 'sqft' ? raw * SQFT_TO_SQM : raw;
    }

    function currentCrowdForCapacity() {
        if (capacitySourceSelect.value === 'simulated') {
            const extra = parseInt(simulationSlider.value, 10) || 0;
            return lastPeopleCount + extra;
        }
        return lastPeopleCount;
    }

    function updateCapacityCheck() {
        const areaSqm = computeAreaSqm();
        const density = parseFloat(densityStandardSelect.value) || 0;
        const maxCapacity = Math.max(0, Math.round(areaSqm * density));
        const current = currentCrowdForCapacity();

        capacityCurrentCountEl.textContent = current;
        capacityMaxCountEl.textContent = maxCapacity;

        const pct = maxCapacity > 0 ? (current / maxCapacity) * 100 : 0;
        capacityBarFill.style.width = Math.min(pct, 100) + '%';

        let status, tone, explanation;
        if (maxCapacity === 0) {
            status = 'ENTER SPACE AREA';
            tone = '';
            explanation = 'Enter a space area to calculate safe capacity.';
        } else if (pct < 70) {
            status = 'WITHIN CAPACITY';
            tone = 'safe';
            explanation = `This space safely holds up to ${maxCapacity} people at the selected density. Currently ${current} people (${pct.toFixed(0)}%) — comfortably within limits.`;
        } else if (pct < 90) {
            const remaining = Math.max(0, maxCapacity - current);
            status = 'APPROACHING CAPACITY';
            tone = 'caution';
            explanation = `${current} of ${maxCapacity} safe capacity used (${pct.toFixed(0)}%). Space can take roughly ${remaining} more people before reaching the limit.`;
        } else if (pct <= 100) {
            status = 'AT CAPACITY';
            tone = 'warning';
            explanation = `${current} of ${maxCapacity} safe capacity used (${pct.toFixed(0)}%). Avoid admitting more people until numbers drop.`;
        } else {
            const over = current - maxCapacity;
            status = 'OVER CAPACITY';
            tone = 'critical';
            explanation = `This space is over its safe capacity by ${over} ${over === 1 ? 'person' : 'people'} (${pct.toFixed(0)}% of ${maxCapacity}). Reduce crowd size immediately.`;
        }

        capacityStatusEl.textContent = status;
        capacityStatusEl.className = 'capacity-status' + (tone ? ' ' + tone : '');
        capacityExplanationEl.textContent = explanation;
        capacityBarFill.className = 'capacity-bar-fill' + (tone ? ' ' + tone : '');

        if (tone === 'critical' && lastCapacityTone !== 'critical') {
            logEvent('Capacity Check', `Space over capacity (${current}/${maxCapacity})`, 'critical');
        }
        lastCapacityTone = tone;
    }

    [spaceAreaInput, areaUnitSelect, densityStandardSelect, capacitySourceSelect].forEach(el => {
        el.addEventListener('input', () => { updateCapacityCheck(); updateOperationsPlan(); });
        el.addEventListener('change', () => { updateCapacityCheck(); updateOperationsPlan(); });
    });

    updateCapacityCheck();

    /* ---------- Trend Chart ---------- */
    function sizeTrendCanvas() {
        const rect = trendCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        trendW = rect.width;
        trendH = rect.height;
        trendCanvas.width = Math.max(1, Math.round(trendW * dpr));
        trendCanvas.height = Math.max(1, Math.round(trendH * dpr));
        trendCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', sizeTrendCanvas);
    sizeTrendCanvas();

    function sampleTrend(count) {
        const now = Date.now();
        if (now - lastTrendSampleTime < TREND_SAMPLE_INTERVAL_MS) return;
        lastTrendSampleTime = now;
        trendData.push(count);
        if (trendData.length > TREND_MAX_POINTS) trendData.shift();
        drawTrendChart();
    }

    function drawTrendChart() {
        if (!trendW) sizeTrendCanvas();
        trendCtx.clearRect(0, 0, trendW, trendH);

        trendCurrentInlineEl.textContent = lastPeopleCount;
        trendPeakInlineEl.textContent = peakCount;

        trendCtx.strokeStyle = 'rgba(255,255,255,0.05)';
        trendCtx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            const y = (trendH / 4) * i;
            trendCtx.beginPath();
            trendCtx.moveTo(0, y);
            trendCtx.lineTo(trendW, y);
            trendCtx.stroke();
        }

        if (trendData.length < 2) return;

        const maxVal = Math.max(10, ...trendData);
        const stepX = trendW / (TREND_MAX_POINTS - 1);
        const offsetX = trendW - (trendData.length - 1) * stepX;

        const pointX = i => offsetX + i * stepX;
        const pointY = v => trendH - (v / maxVal) * (trendH - 10) - 4;

        trendCtx.beginPath();
        trendCtx.moveTo(pointX(0), trendH);
        trendData.forEach((v, i) => trendCtx.lineTo(pointX(i), pointY(v)));
        trendCtx.lineTo(pointX(trendData.length - 1), trendH);
        trendCtx.closePath();
        const areaGrad = trendCtx.createLinearGradient(0, 0, 0, trendH);
        areaGrad.addColorStop(0, 'rgba(139, 92, 246, 0.30)');
        areaGrad.addColorStop(1, 'rgba(139, 92, 246, 0)');
        trendCtx.fillStyle = areaGrad;
        trendCtx.fill();

        trendCtx.beginPath();
        trendData.forEach((v, i) => {
            const x = pointX(i), y = pointY(v);
            if (i === 0) trendCtx.moveTo(x, y); else trendCtx.lineTo(x, y);
        });
        const lineGrad = trendCtx.createLinearGradient(0, 0, trendW, 0);
        lineGrad.addColorStop(0, '#8B5CF6');
        lineGrad.addColorStop(0.55, '#F350D6');
        lineGrad.addColorStop(1, '#45E4FF');
        trendCtx.strokeStyle = lineGrad;
        trendCtx.lineWidth = 2;
        trendCtx.lineJoin = 'round';
        trendCtx.stroke();

        const lastIdx = trendData.length - 1;
        trendCtx.beginPath();
        trendCtx.arc(pointX(lastIdx), pointY(trendData[lastIdx]), 3.5, 0, Math.PI * 2);
        trendCtx.fillStyle = '#45E4FF';
        trendCtx.fill();
    }

    /* ---------- Surge Anomaly Detection ---------- */
    function checkSurge(count) {
        const now = Date.now();
        countWindow.push({ t: now, count });
        countWindow = countWindow.filter(e => now - e.t <= SURGE_WINDOW_MS);

        let surging = false;
        if (countWindow.length >= 2) {
            const oldest = countWindow[0].count;
            const delta = count - oldest;
            const relative = oldest > 0 ? delta / oldest : (count > 0 ? 1 : 0);
            surging = delta >= SURGE_ABS_THRESHOLD || relative >= SURGE_PCT_THRESHOLD;
        }

        surgeAlertEl.classList.toggle('hidden', !surging);
        if (surging && !surgeActive) {
            logEvent('Surge Detection', `Rapid increase to ${count} people`, 'critical');
        }
        surgeActive = surging;
    }

    /* ---------- Evacuation & Operations Planner ---------- */
    function updateOperationsPlan() {
        const count = currentCrowdForCapacity();

        let totalThroughput = 0;
        let openGates = 0;
        gateIds.forEach(id => {
            const t = GATE_THROUGHPUT[gateStatuses[id]] || 0;
            totalThroughput += t;
            if (t > 0) openGates++;
        });

        evacOpenGatesEl.textContent = `${openGates} / 4`;
        evacThroughputEl.textContent = `${totalThroughput} people/min`;

        if (count === 0) {
            evacTimeEl.textContent = '—';
            evacDetailEl.textContent = 'No crowd currently present.';
        } else if (totalThroughput === 0) {
            evacTimeEl.textContent = 'N/A';
            evacDetailEl.textContent = 'All gates are closed — evacuation is not possible until a gate reopens.';
        } else {
            const minutes = count / totalThroughput;
            evacTimeEl.textContent = minutes < 1 ? '< 1 min' : `${minutes.toFixed(1)} min`;
            evacDetailEl.textContent = `Estimated time to fully clear the venue through ${openGates} active gate${openGates === 1 ? '' : 's'} at current throughput.`;
        }

        const risk = riskFromCount(count);
        const stewards = count > 0 ? Math.max(1, Math.ceil(count / STEWARD_RATIO[risk])) : 0;
        const medical = count > 0 ? Math.max(1, Math.ceil(count / MEDICAL_RATIO[risk])) : 0;
        staffStewardsEl.textContent = stewards;
        staffMedicalEl.textContent = medical;
        staffTotalEl.textContent = stewards + medical;
    }

    /* ---------- Session Export ---------- */
    function formatDuration(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins}m ${secs}s`;
    }

    function updateReportStats() {
        reportPeakEl.textContent = peakCount;
        reportAverageEl.textContent = countSamples ? (countSum / countSamples).toFixed(1) : 0;
    }

    setInterval(() => {
        reportDurationEl.textContent = formatDuration(Date.now() - sessionStart);
    }, 1000);

    function buildReportText() {
        const durationMs = Date.now() - sessionStart;
        const totalRiskMs = Object.values(riskTimeMs).reduce((a, b) => a + b, 0) || 1;
        const pct = k => ((riskTimeMs[k] / totalRiskMs) * 100).toFixed(1);
        const avgCount = countSamples ? (countSum / countSamples).toFixed(1) : '0';

        const lines = [
            'CROWDFLOW AI — SESSION REPORT',
            'Generated: ' + new Date().toLocaleString(),
            '',
            'Session Duration: ' + formatDuration(durationMs),
            'Peak Crowd Count: ' + peakCount,
            'Average Crowd Count: ' + avgCount,
            '',
            'Time at Risk Level:',
            '  LOW: ' + pct('LOW') + '%',
            '  MEDIUM: ' + pct('MEDIUM') + '%',
            '  HIGH: ' + pct('HIGH') + '%',
            '  CRITICAL: ' + pct('CRITICAL') + '%',
            '',
            'Final Capacity Status: ' + capacityStatusEl.textContent +
                ' (' + capacityCurrentCountEl.textContent + ' / ' + capacityMaxCountEl.textContent + ')',
            'Estimated Evacuation Time: ' + evacTimeEl.textContent,
            'Recommended Staffing: ' + staffTotalEl.textContent +
                ' (Stewards: ' + staffStewardsEl.textContent + ', Medical: ' + staffMedicalEl.textContent + ')',
            '',
            'Event Log:'
        ];

        Array.from(eventHistoryEl.children).reverse().forEach(item => {
            lines.push('  ' + item.textContent.replace(/\s+/g, ' ').trim());
        });

        return lines.join('\n');
    }

    exportReportBtn.addEventListener('click', () => {
        const text = buildReportText();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `crowdflow-session-report-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        logEvent('Report', 'Session report exported', '');
    });

    /* ---------- Init ---------- */
    logEvent('System', 'CrowdFlow AI CCTV Engine Connected', 'safe');
    sizeHeatmapCanvas();
    updateHeatmap();
    sizeTrendCanvas();
    drawTrendChart();
    updateOperationsPlan();
    updateReportStats();
    reportDurationEl.textContent = formatDuration(0);
})();