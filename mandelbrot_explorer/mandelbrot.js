const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2');

if (!gl) {
    console.error('Unable to initialize WebGL 2.');
} else {
    const f = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    console.log('Highp:', f ? [f.rangeMin, f.rangeMax, f.precision] : 'Not Supported');
    console.log('SplitTest:', splitDouble(1.23e-7));
}

// --- Shader Sources (Emulated Double Precision - DS) ---

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
    
    // Safety from optimization
    uniform float u_split; // 4097.0
    
    out vec4 outColor;

    // --- DS Math Functions (Robust Implementation) ---
    
    // ds_add(a, b) = a + b
    vec2 ds_add(vec2 a, vec2 b) {
        vec2 t;
        float t1, t2, e;
        t1 = a.x + b.x;
        e = t1 - a.x;
        t2 = ((b.x - e) + (a.x - (t1 - e))) + a.y + b.y;
        t.x = t1 + t2;
        t.y = t2 - (t.x - t1);
        return t;
    }

    // ds_sub(a, b) = a - b
    vec2 ds_sub(vec2 a, vec2 b) {
        vec2 t;
        float t1, t2, e;
        t1 = a.x - b.x;
        e = t1 - a.x;
        t2 = ((-b.x - e) + (a.x - (t1 - e))) + a.y - b.y;
        t.x = t1 + t2;
        t.y = t2 - (t.x - t1);
        return t;
    }

    // ds_mul(a, b) = a * b
    vec2 ds_mul(vec2 a, vec2 b) {
        float c = u_split; // Prevent optimization
        
        float cona = a.x * c;
        float a_hi = cona - (cona - a.x);
        float a_lo = a.x - a_hi;
        
        float conb = b.x * c;
        float b_hi = conb - (conb - b.x);
        float b_lo = b.x - b_hi;
        
        float C1 = a.x * b.x;
        float C2 = (a_hi * b_hi - C1) + a_hi * b_lo + a_lo * b_hi + a_lo * b_lo;
        
        // Add low-order products
        float t2 = C2 + a.x * b.y + a.y * b.x;
        
        vec2 t;
        t.x = C1 + t2;
        t.y = t2 - (t.x - C1);
        return t;
    }

    // ds_sqr(a) = a * a
    vec2 ds_sqr(vec2 a) {
        return ds_mul(a, a);
    }
    
    // Palette
    vec3 pal( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d ) {
        return a + b*cos( 6.28318*(c*t+d) );
    }

    void main(void) {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        uv = uv * 2.0 - 1.0;
        
        float aspect = u_resolution.x / u_resolution.y;
        uv.x *= aspect;

        // C = Center + (uv * scale)
        // Optimization: At high zoom, scale is very small (e.g. 1e-10)
        // Center is large (e.g. 1.0).
        // Standard ds_add might lose precision if not careful.
        // We can manually inject the offset into the low part of center 
        // because offset is guaranteed to be small compared to center.x
        
        // Calculate offset in DS
        // Simplified offset: bypass ds_mul splitting which might be failing for small scale
        // Since u_scale.y is likely 0 at high zoom, and uv.y is 0 in uv_x_ds,
        // we can just multiply the floats.
        vec2 dx = vec2(uv.x * u_scale.x, 0.0);
        vec2 dy = vec2(uv.y * u_scale.x, 0.0);
        
        // Manual Add: cx = (u_center_x.x, u_center_x.y + dx.x)
        // This assumes dx is small enough to generally fit in the low part 'gap'
        
        vec2 cx;
        cx.x = u_center_x.x;
        cx.y = u_center_x.y + dx.x; 
        
        vec2 cy;
        cy.x = u_center_y.x;
        cy.y = u_center_y.y + dy.x;
        
        // We rely on the manual addition for the initial coordinate to prevent
        // precision loss in ds_add when adding a tiny offset to a large center.
        
        // cx = ds_add(u_center_x, dx); // REVERTED: Using manual method
        // cy = ds_add(u_center_y, dy); // REVERTED: Using manual method

        vec2 zx = vec2(0.0);
        vec2 zy = vec2(0.0);
        
        vec2 zx_sqr = vec2(0.0);
        vec2 zy_sqr = vec2(0.0);
        
        float iter = 0.0;
        float maxIter = float(u_maxIterations);

        // Escape checking
        for(int i = 0; i < 5000; i++) {
            if (i >= u_maxIterations) break;
            
            // zx_new = zx^2 - zy^2 + cx
            // zy_new = 2*zx*zy + cy
            
            zx_sqr = ds_sqr(zx);
            zy_sqr = ds_sqr(zy);
            
            if (ds_add(zx_sqr, zy_sqr).x > 4.0) break;
            
            vec2 two_zx = ds_add(zx, zx);
            vec2 term_y = ds_mul(two_zx, zy);
            
            vec2 next_zy = ds_add(term_y, cy);
            
            vec2 diff_sqr = ds_sub(zx_sqr, zy_sqr);
            vec2 next_zx = ds_add(diff_sqr, cx);
            
            zx = next_zx;
            zy = next_zy;
            
            iter += 1.0;
        }

        float smoothVal = iter;
        if (iter < maxIter) {
            float dist = sqrt(ds_add(zx_sqr, zy_sqr).x);
            smoothVal = iter - log2(max(1.0, log2(dist)));
        }

        float t = smoothVal / 50.0;
        vec3 color = vec3(0.0);

        if (iter >= maxIter) {
            color = vec3(0.0);
        } else {
             if (u_palette == 0) { // Midnight Fire
                color = pal(t * 0.5, vec3(0.8,0.5,0.4), vec3(0.2,0.4,0.2), vec3(2.0,1.0,1.0), vec3(0.0,0.25,0.25) );
            } else if (u_palette == 1) { // Electric Blue
                color = pal(t, vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,1.0),vec3(0.0,0.10,0.20));
            } else if (u_palette == 2) { // Radioactive
                color = vec3(0.1, 1.0, 0.2) * (sin(t * 20.0) * 0.5 + 0.5);
            } else if (u_palette == 3) { // Cotton Candy
                 color = pal( t, vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,0.5),vec3(0.8,0.90,0.30) );
            } else if (u_palette == 4) { // Matrix
                 float val = fract(t * 5.0);
                 color = vec3(0.0, val, 0.0);
            } else { // Rainbow
                  color = pal( t, vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,1.0),vec3(0.0,0.33,0.67) );
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
        return null;
    }
    return shaderProgram;
}

function loadShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
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

// --- JS State ---

function splitDouble(v) {
    const high = Math.fround(v);
    const low = v - high;
    return [high, low];
}

let state = {
    center: { x: -0.4153118940, y: 0.6019775837 },
    zoom: 3.42e7,
    palette: 2,
    isDragging: false,
    lastMouse: { x: 0, y: 0 }
};


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
    // console.log("Scale:", scale, "Split:", scaleSplit);
    gl.uniform2f(programInfo.uniformLocations.scale, scaleSplit[0], scaleSplit[1]);

    gl.uniform1i(programInfo.uniformLocations.palette, state.palette);

    let dynamicIter = 100 + Math.log10(state.zoom) * 150;
    if (dynamicIter < 200) dynamicIter = 200;
    if (dynamicIter > 2500) dynamicIter = 2500;
    gl.uniform1i(programInfo.uniformLocations.maxIterations, Math.floor(dynamicIter));
    gl.uniform1f(programInfo.uniformLocations.split, 4097.0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    updateUI();
}

function updateUI() {
    const zoomDisplay = document.getElementById('zoom-display');
    const posDisplay = document.getElementById('pos-display');
    if (zoomDisplay) zoomDisplay.innerText = state.zoom.toExponential(2) + "x";
    if (posDisplay) posDisplay.innerText = `${state.center.x.toFixed(10)}, ${state.center.y.toFixed(10)}`;
}

// --- Interaction ---

canvas.addEventListener('mousedown', e => {
    state.isDragging = true;
    state.lastMouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mouseup', () => state.isDragging = false);

window.addEventListener('mousemove', e => {
    if (!state.isDragging) return;

    const dx = e.clientX - state.lastMouse.x;
    const dy = e.clientY - state.lastMouse.y;

    // Move logic
    // Fractal_Delta = Pixel_Delta * (Scale / Pixel_Height) * Aspect? No.
    // Length in Fractal = 4.0 / zoom * aspect.
    // Pixel Length = W
    // dF = dx * (4.0*aspect/zoom)/W = dx * 4/zoom/H

    const dFactor = 4.0 / (state.zoom * canvas.clientHeight); // use Physical Height
    state.center.x -= dx * dFactor * (window.devicePixelRatio || 1);
    state.center.y += dy * dFactor * (window.devicePixelRatio || 1);

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
    startPoints: [], // [{x, y, id}] - device pixels relative to canvas
    // For pinch zoom:
    initialDistance: 0, // Distance between fingers at start of pinch
    initialZoom: 1.0,   // Zoom level at start of pinch
    pinchCenterCanvas: { x: 0, y: 0 }, // Midpoint of fingers at start of pinch
    // For panning:
    lastMouse: { x: 0, y: 0 } // last touch point for panning
};

function getTouchById(id) {
    return touchState.startPoints.find(p => p.id === id);
}

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
    e.preventDefault(); // Prevent default browser actions like scrolling
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Current touches in device pixels relative to canvas top-left
    const currentTouchesInCanvasPx = Array.from(e.touches).map(touch => ({
        id: touch.identifier,
        x: (touch.clientX - rect.left) * dpr,
        y: (touch.clientY - rect.top) * dpr
    }));
    touchState.startPoints = currentTouchesInCanvasPx; // Store current points

    if (currentTouchesInCanvasPx.length === 1) {
        touchState.isPanning = true;
        touchState.lastMouse = currentTouchesInCanvasPx[0]; // Start panning from here
    } else if (currentTouchesInCanvasPx.length === 2) {
        touchState.isPanning = false;
        const p1 = currentTouchesInCanvasPx[0];
        const p2 = currentTouchesInCanvasPx[1];
        touchState.initialDistance = getDistance(p1, p2); // Store initial distance
        touchState.initialZoom = state.zoom;             // Store initial zoom level
        touchState.pinchCenterCanvas = getMidpoint(p1, p2); // Store initial pinch center
    }
}, { passive: false }); // passive: false is important for preventDefault

window.addEventListener('touchend', (e) => {
    // If no touches remain, reset state
    if (e.touches.length === 0) {
        touchState.isPanning = false;
        touchState.startPoints = [];
        // Reset pinch-specific state if needed, though not strictly necessary here
        // touchState.initialDistance = 0;
        // touchState.initialZoom = 1.0;
        // touchState.pinchCenterCanvas = {x:0, y:0};
    } else if (e.touches.length === 1) {
        // If one finger is left, transition to panning mode
        touchState.isPanning = true;
        // Reset lastMouse to the current position of the remaining finger
        const remainingTouch = Array.from(e.touches)[0];
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        touchState.lastMouse = {
            x: (remainingTouch.clientX - rect.left) * dpr,
            y: (remainingTouch.clientY - rect.top) * dpr
        };
        // Update startPoints to reflect the single finger
        touchState.startPoints = [{
            id: remainingTouch.identifier,
            x: touchState.lastMouse.x,
            y: touchState.lastMouse.y
        }];
        // Reset pinch state if transitioning from pinch to pan
        // touchState.initialDistance = 0;
    }
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault(); // Prevent default browser actions

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Current touch points in device pixels relative to canvas top-left
    const currentTouchesInCanvasPx = Array.from(e.touches).map(touch => ({
        id: touch.identifier,
        x: (touch.clientX - rect.left) * dpr,
        y: (touch.clientY - rect.top) * dpr
    }));

    if (touchState.isPanning && currentTouchesInCanvasPx.length === 1) {
        // Panning logic
        const currentTouch = currentTouchesInCanvasPx[0];
        const dx = currentTouch.x - touchState.lastMouse.x;
        const dy = currentTouch.y - touchState.lastMouse.y;

        // Calculate pan delta based on fractal coordinates
        const dFactor = 4.0 / (state.zoom * canvas.clientHeight); // Use physical height for scaling
        state.center.x -= dx * dFactor;
        state.center.y += dy * dFactor;

        touchState.lastMouse = currentTouch; // Update last mouse position for next pan event
        requestAnimationFrame(drawScene);
    } else if (!touchState.isPanning && currentTouchesInCanvasPx.length === 2) {
        // Pinch-zoom logic
        const p1_current = currentTouchesInCanvasPx[0];
        const p2_current = currentTouchesInCanvasPx[1];
        const mid_current = getMidpoint(p1_current, p2_current); // Current pinch center in device pixels
        const distance_current = getDistance(p1_current, p2_current);

        // Calculate zoom factor based on the ratio of current distance to initial distance
        // This makes zoom directly proportional to the finger spread.
        const zoomRatio = touchState.initialDistance > 0 ? distance_current / touchState.initialDistance : 1.0;

        // Update state.zoom based on the initial zoom and the calculated zoom ratio
        state.zoom = touchState.initialZoom * zoomRatio;

        // Adjust center to zoom towards the pinch center
        const aspect = canvas.width / canvas.height;

        // Convert the *initial* pinch center to normalized coordinates [-1, 1]
        const mx_norm_initial = (touchState.pinchCenterCanvas.x / canvas.width) * 2.0 - 1.0;
        const my_norm_initial = -(touchState.pinchCenterCanvas.y / canvas.height) * 2.0 + 1.0; // Y is inverted

        // Apply aspect ratio for x coordinate to get fractal-like coordinates
        const nx = mx_norm_initial * aspect;
        const ny = my_norm_initial;

        // Calculate scale before and after zoom update
        const scale_old = 2.0 / touchState.initialZoom; // Scale related to initial zoom
        const scale_new = 2.0 / state.zoom;            // Scale related to current zoom

        // Adjust center to zoom towards the pinch center
        // The adjustment moves the center based on the difference in scale and the pinch center's position
        state.center.x = state.center.x + nx * (scale_old - scale_new);
        state.center.y = state.center.y + ny * (scale_old - scale_new);

        requestAnimationFrame(drawScene);
    }
}, { passive: false }); // passive: false is important for preventDefault

window.addEventListener('resize', drawScene);


requestAnimationFrame(drawScene);
