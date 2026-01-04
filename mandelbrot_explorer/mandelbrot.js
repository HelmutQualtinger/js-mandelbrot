const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2');

if (!gl) {
    console.error('Unable to initialize WebGL 2.');
} else {
    console.log('Using WebGL with double-double precision    Harry was here');
    console.log('Precision: ~48 bits (two 32-bit floats)');
    console.log('Max zoom before artifacts: ~2.8e14');
    console.log('Split constant (JS): 2^27+1 = 134217729');
    console.log('Split constant (shader): 2^12+1 = 4097');
}

// --- Shader Sources (Double-Double Precision) ---

const vsSource = `#version 300 es
    in vec4 aVertexPosition;
    void main(void) {
        gl_Position = aVertexPosition;
    }
`;

const fsSource = `#version 300 es
    precision highp float;

    uniform vec2 u_resolution;
    uniform vec2 u_center_x; // High/Low pair
    uniform vec2 u_center_y; // High/Low pair
    uniform vec2 u_scale;    // 2.0 / Zoom as High/Low pair
    uniform int u_palette;
    uniform int u_maxIterations;
    uniform float u_split; // 4097.0 for Veltkamp splitting (2^12+1 for 32-bit floats)

    out vec4 outColor;

    // --- Double-Double Math Functions ---

    // Quick two-sum: assumes |a| >= |b|
    vec2 quickTwoSum(float a, float b) {
        float s = a + b;
        float e = b - (s - a);
        return vec2(s, e);
    }

    // Two-sum: no assumption on magnitudes
    vec2 twoSum(float a, float b) {
        float s = a + b;
        float v = s - a;
        float e = (a - (s - v)) + (b - v);
        return vec2(s, e);
    }

    // Split for exact multiplication
    vec2 split(float a) {
        float c = u_split * a;
        float a_hi = c - (c - a);
        float a_lo = a - a_hi;
        return vec2(a_hi, a_lo);
    }

    // Two-product: exact product of two floats
    vec2 twoProd(float a, float b) {
        float p = a * b;
        vec2 aS = split(a);
        vec2 bS = split(b);
        float err = ((aS.x * bS.x - p) + aS.x * bS.y + aS.y * bS.x) + aS.y * bS.y;
        return vec2(p, err);
    }

    // DD addition: a + b
    vec2 dd_add(vec2 a, vec2 b) {
        vec2 s = twoSum(a.x, b.x);
        vec2 e = twoSum(a.y, b.y);
        float c = s.y + e.x;
        vec2 v = quickTwoSum(s.x, c);
        vec2 w = quickTwoSum(v.x, e.y + v.y);
        return w;
    }

    // DD subtraction: a - b
    vec2 dd_sub(vec2 a, vec2 b) {
        vec2 s = twoSum(a.x, -b.x);
        vec2 e = twoSum(a.y, -b.y);
        float c = s.y + e.x;
        vec2 v = quickTwoSum(s.x, c);
        vec2 w = quickTwoSum(v.x, e.y + v.y);
        return w;
    }

    // DD multiplication: a * b
    vec2 dd_mul(vec2 a, vec2 b) {
        vec2 p = twoProd(a.x, b.x);
        float c = a.x * b.y + a.y * b.x;
        vec2 v = quickTwoSum(p.x, p.y + c);
        return v;
    }

    // Palette function
    vec3 pal(in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d) {
        return a + b * cos(6.28318 * (c * t + d));
    }

    void main(void) {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        uv = uv * 2.0 - 1.0;

        float aspect = u_resolution.x / u_resolution.y;
        uv.x *= aspect;

        // Calculate offset using DD arithmetic
        vec2 uvx_dd = vec2(uv.x, 0.0);
        vec2 uvy_dd = vec2(uv.y, 0.0);

        vec2 dx = dd_mul(uvx_dd, u_scale);
        vec2 dy = dd_mul(uvy_dd, u_scale);

        // Calculate complex coordinates
        vec2 cx = dd_add(u_center_x, dx);
        vec2 cy = dd_add(u_center_y, dy);

        // Mandelbrot iteration with DD precision
        vec2 zx = vec2(0.0);
        vec2 zy = vec2(0.0);

        float iter = 0.0;
        float maxIter = float(u_maxIterations);

        for(int i = 0; i < 20000; i++) {
            if (i >= u_maxIterations) break;

            // zx^2, zy^2
            vec2 zx2 = dd_mul(zx, zx);
            vec2 zy2 = dd_mul(zy, zy);

            // Check escape: |z|^2 > 4
            vec2 mag2 = dd_add(zx2, zy2);
            if (mag2.x > 4.0) break;

            // zy_new = 2 * zx * zy + cy
            vec2 two_zx = dd_add(zx, zx);
            vec2 two_zx_zy = dd_mul(two_zx, zy);
            vec2 zy_new = dd_add(two_zx_zy, cy);

            // zx_new = zx^2 - zy^2 + cx
            vec2 zx2_minus_zy2 = dd_sub(zx2, zy2);
            vec2 zx_new = dd_add(zx2_minus_zy2, cx);

            zx = zx_new;
            zy = zy_new;
            iter += 1.0;
        }

        // Smooth coloring
        float smoothVal = iter;
        if (iter < maxIter) {
            vec2 zx2 = dd_mul(zx, zx);
            vec2 zy2 = dd_mul(zy, zy);
            vec2 mag2 = dd_add(zx2, zy2);
            float dist = sqrt(mag2.x + mag2.y);
            smoothVal = iter - log2(max(1.0, log2(dist)));
        }

        float t = smoothVal / 50.0;
        vec3 color = vec3(0.0);

        if (iter >= maxIter) {
            color = vec3(0.0);
        } else {
            if (u_palette == 0) { // Midnight Fire
                color = pal(t * 0.5, vec3(0.8,0.5,0.4), vec3(0.2,0.4,0.2), vec3(2.0,1.0,1.0), vec3(0.0,0.25,0.25));
            } else if (u_palette == 1) { // Electric Blue
                color = pal(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(1.0,1.0,1.0), vec3(0.0,0.10,0.20));
            } else if (u_palette == 2) { // Radioactive
                float s = sin(t * 20.0) * 0.5 + 0.5;
                color = vec3(0.1, 1.0, 0.2) * s;
            } else if (u_palette == 3) { // Cotton Candy
                color = pal(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(1.0,1.0,0.5), vec3(0.8,0.90,0.30));
            } else if (u_palette == 4) { // Matrix
                float val = fract(t * 5.0);
                color = vec3(0.0, val, 0.0);
            } else if (u_palette == 5) { // Sunset
                float tt5 = pow(clamp(t, 0.0, 1.0), 0.7);
                color = pal(tt5, vec3(0.95,0.7,0.45), vec3(0.6,0.25,0.05), vec3(1.0,0.5,0.0), vec3(0.0,0.08,0.18));
            } else if (u_palette == 6) { // Deep Purple
                float tt6 = fract(t * 2.0);
                color = mix(vec3(0.2, 0.0, 0.3), vec3(1.0, 0.0, 1.0), tt6);
            } else if (u_palette == 7) { // Golden Hour
                float tt7 = fract(t * 2.0);
                color = mix(vec3(1.0, 0.3, 0.0), vec3(1.0, 1.0, 0.0), tt7);
            } else { // Rainbow
                color = pal(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(1.0,1.0,1.0), vec3(0.0,0.33,0.67));
            }
        }

        outColor = vec4(color, 1.0);
    }
`;

function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('Shader linking failed:', gl.getProgramInfoLog(shaderProgram));
        return null;
    }
    return shaderProgram;
}

function loadShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compilation failed:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

const programInfo = {
    program: shaderProgram,
    attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
    },
    uniformLocations: {
        resolution: gl.getUniformLocation(shaderProgram, 'u_resolution'),
        center_x: gl.getUniformLocation(shaderProgram, 'u_center_x'),
        center_y: gl.getUniformLocation(shaderProgram, 'u_center_y'),
        scale: gl.getUniformLocation(shaderProgram, 'u_scale'),
        palette: gl.getUniformLocation(shaderProgram, 'u_palette'),
        maxIterations: gl.getUniformLocation(shaderProgram, 'u_maxIterations'),
        split: gl.getUniformLocation(shaderProgram, 'u_split'),
    },
};

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
const positions = [-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0];
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

// --- Veltkamp splitting for double-double ---
// JavaScript uses 64-bit doubles: split with 2^27 + 1
const SPLIT_JS = 134217729.0; // 2^27 + 1 for 64-bit JS doubles
// WebGL shaders use 32-bit floats: split with 2^12 + 1
const SPLIT_SHADER = 4097.0; // 2^12 + 1 for 32-bit shader floats

function splitDouble(v) {
    const c = SPLIT_JS * v;
    const high = c - (c - v);
    const low = v - high;
    return [high, low];
}

// --- State ---
let state = {
    center: { x: -0.4153118940, y: 0.6019775837 },
    zoom: 1,
    palette: 2,
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
    currentMousePos: { x: 0, y: 0 },
    currentIterations: 0,
    cursorRe: 0,
    cursorIm: 0
};

// --- DD Arithmetic for Iteration Calculation ---
function ddAdd(a, b) {
    const s = a[0] + b[0];
    const v = s - a[0];
    const e = (a[0] - (s - v)) + (b[0] - v);
    const c = a[1] + b[1];
    const w = s + c;
    const ey = w - s;
    return [w, e - ey + c + a[1]];
}

function ddSub(a, b) {
    const s = a[0] - b[0];
    const v = s - a[0];
    const e = (a[0] - (s - v)) - (b[0] + v);
    const c = a[1] - b[1];
    const w = s + c;
    const ey = w - s;
    return [w, e - ey + c + a[1]];
}

function ddMul(a, b) {
    const p = a[0] * b[0];
    const c = SPLIT_JS * a[0];
    const a_hi = c - (c - a[0]);
    const a_lo = a[0] - a_hi;
    const c2 = SPLIT_JS * b[0];
    const b_hi = c2 - (c2 - b[0]);
    const b_lo = b[0] - b_hi;
    const err = ((a_hi * b_hi - p) + a_hi * b_lo + a_lo * b_hi) + a_lo * b_lo;
    const ps = p + a[1] * b[0] + a[0] * b[1];
    return [ps, err + a[1] * b[1]];
}

// Calculate iterations for a given complex number using DD precision
function calculateIterations(cx, cy, maxIter) {
    let zx = [0, 0];
    let zy = [0, 0];
    let cx_dd = [cx, 0];
    let cy_dd = [cy, 0];

    for (let i = 0; i < maxIter; i++) {
        // Calculate zx^2 and zy^2
        const zx2 = ddMul(zx, zx);
        const zy2 = ddMul(zy, zy);

        // Check escape: |z|^2 > 4
        const mag2 = ddAdd(zx2, zy2);
        if (mag2[0] > 4.0) {
            return i;
        }

        // Calculate zy_new = 2 * zx * zy + cy
        const two_zx = ddAdd(zx, zx);
        const two_zx_zy = ddMul(two_zx, zy);
        zy = ddAdd(two_zx_zy, cy_dd);

        // Calculate zx_new = zx^2 - zy^2 + cx
        const zx2_minus_zy2 = ddSub(zx2, zy2);
        zx = ddAdd(zx2_minus_zy2, cx_dd);
    }

    return maxIter;
}

// Calculate iterations for pixel under cursor
function getIterationsUnderCursor(pixelX, pixelY) {
    const aspect = canvas.width / canvas.height;

    // Convert pixel coordinates to normalized device coordinates
    let uv = {
        x: pixelX / canvas.width,
        y: pixelY / canvas.height
    };

    uv.x = uv.x * 2.0 - 1.0;
    uv.y = uv.y * 2.0 - 1.0;
    uv.x *= aspect;

    // Apply zoom and center
    const scale = 2.0 / state.zoom;
    const cx = state.center.x + uv.x * scale;
    const cy = state.center.y - uv.y * scale;

    // Calculate dynamic iterations
    let dynamicIter = 100 + Math.log10(state.zoom) * 150;
    if (dynamicIter < 200) dynamicIter = 200;
    if (dynamicIter > 20000) dynamicIter = 20000;

    const iterations = calculateIterations(cx, cy, Math.floor(dynamicIter));

    return {
        iterations: iterations,
        re: cx,
        im: cy
    };
}

function drawScene() {
    // High DPI support
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.floor(canvas.clientWidth * dpr);
    const displayHeight = Math.floor(canvas.clientHeight * dpr);

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.useProgram(programInfo.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    gl.uniform2f(programInfo.uniformLocations.resolution, canvas.width, canvas.height);

    const cx = splitDouble(state.center.x);
    const cy = splitDouble(state.center.y);
    gl.uniform2f(programInfo.uniformLocations.center_x, cx[0], cx[1]);
    gl.uniform2f(programInfo.uniformLocations.center_y, cy[0], cy[1]);

    const scale = 2.0 / state.zoom;
    const scaleSplit = splitDouble(scale);
    gl.uniform2f(programInfo.uniformLocations.scale, scaleSplit[0], scaleSplit[1]);

    gl.uniform1i(programInfo.uniformLocations.palette, state.palette);

    let dynamicIter = 100 + Math.log10(state.zoom) * 150;
    if (dynamicIter < 2000) dynamicIter = 2000;
    if (dynamicIter > 1000) dynamicIter = 1000;
    gl.uniform1i(programInfo.uniformLocations.maxIterations, Math.floor(dynamicIter));
    gl.uniform1f(programInfo.uniformLocations.split, SPLIT_SHADER);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    updateUI();
}

function updateUI() {
    const zoomDisplay = document.getElementById('zoom-display');
    const posDisplay = document.getElementById('pos-display');
    const precisionDisplay = document.getElementById('precision-display');
    const iterDisplay = document.getElementById('iter-display');

    if (zoomDisplay) zoomDisplay.innerText = state.zoom.toExponential(2) + "x";
    if (posDisplay) posDisplay.innerText = `${state.center.x.toFixed(10)}, ${state.center.y.toFixed(10)}`;
    if (iterDisplay) {
        const reStr = state.cursorRe.toFixed(10);
        const imStr = state.cursorIm.toFixed(10);
        iterDisplay.innerText = `Iter: ${state.currentIterations} | Re: ${reStr} | Im: ${imStr}`;
    }

    // Precision calculation
    // DD with 32-bit floats gives ~48 bits of mantissa precision
    // Theoretical max zoom: ~2^48 = 2.8e14
    // Beyond this, pixelation will appear
    if (precisionDisplay) {
        const maxZoom = 2.8e14; // ~48 bits precision
        const precisionPct = Math.min(100, (Math.log10(state.zoom) / Math.log10(maxZoom)) * 100);
        let status = 'OK';
        let color = '#4f4';

        if (precisionPct > 90) {
            status = 'LIMIT';
            color = '#f44';
        } else if (precisionPct > 70) {
            status = 'HIGH';
            color = '#ff4';
        }

        precisionDisplay.innerHTML = `Precision: <span style="color:${color}">${precisionPct.toFixed(0)}% (${status})</span>`;
    }
}

// --- Interaction ---

canvas.addEventListener('mousedown', e => {
    state.isDragging = true;
    state.lastMouse = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mouseup', () => state.isDragging = false);

window.addEventListener('mousemove', e => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) * dpr;
    const canvasY = (e.clientY - rect.top) * dpr;

    // Update iterations display for cursor position
    if (canvasX >= 0 && canvasX < canvas.width && canvasY >= 0 && canvasY < canvas.height) {
        const cursorData = getIterationsUnderCursor(canvasX, canvasY);
        state.currentIterations = cursorData.iterations;
        state.cursorRe = cursorData.re;
        state.cursorIm = cursorData.im;
        updateUI();
    }

    if (!state.isDragging) return;

    const dx = e.clientX - state.lastMouse.x;
    const dy = e.clientY - state.lastMouse.y;

    const dFactor = 4.0 / (state.zoom * canvas.clientHeight);
    state.center.x -= dx * dFactor * dpr;
    state.center.y += dy * dFactor * dpr;

    state.lastMouse = { x: e.clientX, y: e.clientY };
    requestAnimationFrame(drawScene);
});

canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const direction = e.deltaY > 0 ? (1 / zoomFactor) : zoomFactor;

    // Zoom to mouse
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const aspect = canvas.width / canvas.height;

    const mx_raw = (e.clientX - rect.left) / canvas.clientWidth * 2.0 - 1.0;
    const my_raw = -((e.clientY - rect.top) / canvas.clientHeight * 2.0 - 1.0);

    const nx = mx_raw * aspect;
    const ny = my_raw;

    const scale_old = 2.0 / state.zoom;
    const new_zoom = state.zoom * direction;
    const scale_new = 2.0 / new_zoom;

    state.center.x += nx * (scale_old - scale_new);
    state.center.y += ny * (scale_old - scale_new);

    state.zoom = new_zoom;
    requestAnimationFrame(drawScene);
}, { passive: false });

const paletteSelect = document.getElementById('palette');
paletteSelect.addEventListener('change', e => {
    state.palette = parseInt(e.target.value);
    requestAnimationFrame(drawScene);
});

const resetBtn = document.getElementById('reset-btn');
if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        state.center = { x: -0.75, y: 0.0 };
        state.zoom = 1.0;
        requestAnimationFrame(drawScene);
    });
}

// --- Touch Interaction ---
let touchState = {
    isPanning: false,
    startPoints: [],
    initialDistance: 0,
    initialZoom: 1.0,
    pinchCenterCanvas: { x: 0, y: 0 },
    lastMouse: { x: 0, y: 0 }
};

function getDistance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function getMidpoint(p1, p2) {
    return {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
    };
}

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const currentTouchesInCanvasPx = Array.from(e.touches).map(touch => ({
        id: touch.identifier,
        x: (touch.clientX - rect.left) * dpr,
        y: (touch.clientY - rect.top) * dpr
    }));
    touchState.startPoints = currentTouchesInCanvasPx;

    if (currentTouchesInCanvasPx.length === 1) {
        touchState.isPanning = true;
        touchState.lastMouse = currentTouchesInCanvasPx[0];
    } else if (currentTouchesInCanvasPx.length === 2) {
        touchState.isPanning = false;
        const p1 = currentTouchesInCanvasPx[0];
        const p2 = currentTouchesInCanvasPx[1];
        touchState.initialDistance = getDistance(p1, p2);
        touchState.initialZoom = state.zoom;
        touchState.pinchCenterCanvas = getMidpoint(p1, p2);
    }
}, { passive: false });

window.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
        touchState.isPanning = false;
        touchState.startPoints = [];
    } else if (e.touches.length === 1) {
        touchState.isPanning = true;
        const remainingTouch = Array.from(e.touches)[0];
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        touchState.lastMouse = {
            x: (remainingTouch.clientX - rect.left) * dpr,
            y: (remainingTouch.clientY - rect.top) * dpr
        };
        touchState.startPoints = [{
            id: remainingTouch.identifier,
            x: touchState.lastMouse.x,
            y: touchState.lastMouse.y
        }];
    }
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const currentTouchesInCanvasPx = Array.from(e.touches).map(touch => ({
        id: touch.identifier,
        x: (touch.clientX - rect.left) * dpr,
        y: (touch.clientY - rect.top) * dpr
    }));

    if (touchState.isPanning && currentTouchesInCanvasPx.length === 1) {
        const currentTouch = currentTouchesInCanvasPx[0];
        const dx = currentTouch.x - touchState.lastMouse.x;
        const dy = currentTouch.y - touchState.lastMouse.y;

        const dFactor = 4.0 / (state.zoom * canvas.clientHeight);
        state.center.x -= dx * dFactor;
        state.center.y += dy * dFactor;

        touchState.lastMouse = currentTouch;
        requestAnimationFrame(drawScene);
    } else if (!touchState.isPanning && currentTouchesInCanvasPx.length === 2) {
        const p1_current = currentTouchesInCanvasPx[0];
        const p2_current = currentTouchesInCanvasPx[1];
        const distance_current = getDistance(p1_current, p2_current);

        const zoomRatio = touchState.initialDistance > 0 ? distance_current / touchState.initialDistance : 1.0;
        state.zoom = touchState.initialZoom * zoomRatio;

        const aspect = canvas.width / canvas.height;
        const mx_norm_initial = (touchState.pinchCenterCanvas.x / canvas.width) * 2.0 - 1.0;
        const my_norm_initial = -(touchState.pinchCenterCanvas.y / canvas.height) * 2.0 + 1.0;

        const nx = mx_norm_initial * aspect;
        const ny = my_norm_initial;

        const scale_old = 2.0 / touchState.initialZoom;
        const scale_new = 2.0 / state.zoom;

        state.center.x = state.center.x + nx * (scale_old - scale_new);
        state.center.y = state.center.y + ny * (scale_old - scale_new);

        requestAnimationFrame(drawScene);
    }
}, { passive: false });

window.addEventListener('resize', drawScene);

// --- Keyboard Shortcuts ---
window.addEventListener('keydown', e => {
    const zoomFactor = 1.1;

    switch(e.key.toLowerCase()) {
        case '+':
        case '=':
            // Zoom in
            state.zoom *= zoomFactor;
            requestAnimationFrame(drawScene);
            break;

        case '-':
        case '_':
            // Zoom out
            state.zoom /= zoomFactor;
            requestAnimationFrame(drawScene);
            break;

        case 'r':
            // Reset to default zoom and position
            state.center = { x: -0.75, y: 0.0 };
            state.zoom = 1.0;
            requestAnimationFrame(drawScene);
            break;

        case 'arrowup':
            // Pan up
            state.center.y += 0.1 / state.zoom;
            requestAnimationFrame(drawScene);
            break;

        case 'arrowdown':
            // Pan down
            state.center.y -= 0.1 / state.zoom;
            requestAnimationFrame(drawScene);
            break;

        case 'arrowleft':
            // Pan left
            state.center.x -= 0.1 / state.zoom;
            requestAnimationFrame(drawScene);
            break;

        case 'arrowright':
            // Pan right
            state.center.x += 0.1 / state.zoom;
            requestAnimationFrame(drawScene);
            break;

        case '?':
            // Show help
            showNotification('Zoom: +/- | Pan: Arrow Keys | Reset: R | Save: S | Help: ?');
            e.preventDefault();
            break;

        case 's':
            // Save image
            const saveBtn = document.getElementById('save-btn');
            if (saveBtn) {
                saveBtn.click();
                e.preventDefault();
            }
            break;
    }
});

// --- Save & Share Functionality ---

function showNotification(message) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.remove('hidden');
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 2000);
}

function encodeState() {
    // Encode state to URL parameters
    const params = new URLSearchParams();
    params.set('x', state.center.x.toString());
    params.set('y', state.center.y.toString());
    params.set('z', state.zoom.toString());
    params.set('p', state.palette.toString());
    return params.toString();
}

function decodeState() {
    // Decode state from URL parameters
    const params = new URLSearchParams(window.location.search);
    if (params.has('x') && params.has('y') && params.has('z')) {
        state.center.x = parseFloat(params.get('x'));
        state.center.y = parseFloat(params.get('y'));
        state.zoom = parseFloat(params.get('z'));
        if (params.has('p')) {
            state.palette = parseInt(params.get('p'));
            const paletteSelect = document.getElementById('palette');
            if (paletteSelect) {
                paletteSelect.value = state.palette;
            }
        }
        return true;
    }
    return false;
}

// Share button - creates shareable URL
const shareBtn = document.getElementById('share-btn');
if (shareBtn) {
    shareBtn.addEventListener('click', () => {
        const stateParams = encodeState();
        const url = window.location.origin + window.location.pathname + '?' + stateParams;

        // Copy to clipboard
        navigator.clipboard.writeText(url).then(() => {
            showNotification('Share link copied to clipboard!');
        }).catch(() => {
            showNotification('Failed to copy link');
        });
    });
}

// Copy button - copies coordinates as text
const copyBtn = document.getElementById('copy-btn');
if (copyBtn) {
    copyBtn.addEventListener('click', () => {
        const coords = `x: ${state.center.x}\ny: ${state.center.y}\nzoom: ${state.zoom.toExponential(2)}\npalette: ${state.palette}`;

        navigator.clipboard.writeText(coords).then(() => {
            showNotification('Coordinates copied to clipboard!');
        }).catch(() => {
            showNotification('Failed to copy coordinates');
        });
    });
}

// Save button - renders at 4x resolution and saves as JPG
const saveBtn = document.getElementById('save-btn');
if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
        showNotification('Rendering high-resolution image...');
        saveBtn.disabled = true;

        try {
            // Create a larger canvas for 4x resolution
            const saveCanvas = document.createElement('canvas');
            const saveDpr = window.devicePixelRatio || 1;
            const outputWidth = Math.floor(canvas.clientWidth * saveDpr * 4);
            const outputHeight = Math.floor(canvas.clientHeight * saveDpr * 4);

            saveCanvas.width = outputWidth;
            saveCanvas.height = outputHeight;

            const saveGl = saveCanvas.getContext('webgl2');

            if (!saveGl) {
                showNotification('WebGL not available for saving');
                saveBtn.disabled = false;
                return;
            }

            // Copy shader program and uniforms from main context
            const saveProgram = initShaderProgram(saveGl, vsSource, fsSource);

            const saveProgramInfo = {
                program: saveProgram,
                attribLocations: {
                    vertexPosition: saveGl.getAttribLocation(saveProgram, 'aVertexPosition'),
                },
                uniformLocations: {
                    resolution: saveGl.getUniformLocation(saveProgram, 'u_resolution'),
                    center_x: saveGl.getUniformLocation(saveProgram, 'u_center_x'),
                    center_y: saveGl.getUniformLocation(saveProgram, 'u_center_y'),
                    scale: saveGl.getUniformLocation(saveProgram, 'u_scale'),
                    palette: saveGl.getUniformLocation(saveProgram, 'u_palette'),
                    maxIterations: saveGl.getUniformLocation(saveProgram, 'u_maxIterations'),
                    split: saveGl.getUniformLocation(saveProgram, 'u_split'),
                },
            };

            const savePositionBuffer = saveGl.createBuffer();
            saveGl.bindBuffer(saveGl.ARRAY_BUFFER, savePositionBuffer);
            saveGl.bufferData(saveGl.ARRAY_BUFFER, new Float32Array([-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0]), saveGl.STATIC_DRAW);

            // Render at high resolution
            saveGl.viewport(0, 0, outputWidth, outputHeight);
            saveGl.useProgram(saveProgramInfo.program);

            saveGl.bindBuffer(saveGl.ARRAY_BUFFER, savePositionBuffer);
            saveGl.vertexAttribPointer(saveProgramInfo.attribLocations.vertexPosition, 2, saveGl.FLOAT, false, 0, 0);
            saveGl.enableVertexAttribArray(saveProgramInfo.attribLocations.vertexPosition);

            saveGl.uniform2f(saveProgramInfo.uniformLocations.resolution, outputWidth, outputHeight);

            const cx = splitDouble(state.center.x);
            const cy = splitDouble(state.center.y);
            saveGl.uniform2f(saveProgramInfo.uniformLocations.center_x, cx[0], cx[1]);
            saveGl.uniform2f(saveProgramInfo.uniformLocations.center_y, cy[0], cy[1]);

            const scale = 2.0 / state.zoom;
            const scaleSplit = splitDouble(scale);
            saveGl.uniform2f(saveProgramInfo.uniformLocations.scale, scaleSplit[0], scaleSplit[1]);

            saveGl.uniform1i(saveProgramInfo.uniformLocations.palette, state.palette);

            // Use higher iterations for high-res render
            let dynamicIter = 100 + Math.log10(state.zoom) * 150;
            if (dynamicIter < 200) dynamicIter = 200;
            if (dynamicIter > 20000) dynamicIter = 20000;
            saveGl.uniform1i(saveProgramInfo.uniformLocations.maxIterations, Math.floor(dynamicIter));
            saveGl.uniform1f(saveProgramInfo.uniformLocations.split, SPLIT_SHADER);

            saveGl.drawArrays(saveGl.TRIANGLE_STRIP, 0, 4);

            // Convert to JPG and download
            saveCanvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                a.href = url;
                a.download = `mandelbrot_${timestamp}_${Math.floor(state.zoom)}x.jpg`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                showNotification('Image saved successfully!');
                saveBtn.disabled = false;
            }, 'image/jpeg', 0.95);

        } catch (error) {
            console.error('Error saving image:', error);
            showNotification('Error saving image');
            saveBtn.disabled = false;
        }
    });
}

// Load state from URL on page load
const loadedFromURL = decodeState();

// Initial render
if (loadedFromURL) {
    showNotification('Location loaded from URL');
}
requestAnimationFrame(drawScene);
