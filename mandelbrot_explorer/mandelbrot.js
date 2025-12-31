const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl');

if (!gl) {
    alert('Unable to initialize WebGL. Your browser or machine may not support it.');
}

// --- Shader Sources (Emulated Double Precision - DS) ---

const vsSource = `
    attribute vec4 aVertexPosition;
    void main(void) {
        gl_Position = aVertexPosition;
    }
`;

const fsSource = `
    precision highp float;

    uniform vec2 u_resolution;
    uniform vec2 u_center_x; // High/Low pair
    uniform vec2 u_center_y; // High/Low pair
    uniform float u_scale;   // 2.0 / Zoom 
    uniform int u_palette;
    uniform int u_maxIterations;

    // --- DS Math Functions ---
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
        vec2 t;
        float c11, c21, c2, e, t1, t2;
        float a1, a2, b1, b2;
        
        float con = 8193.0; // 2^13 + 1
        
        float cona = a.x * con;
        a1 = cona - (cona - a.x);
        a2 = a.x - a1;
        
        float conb = b.x * con;
        b1 = conb - (conb - b.x);
        b2 = b.x - b1;
        
        c11 = a.x * b.x;
        c21 = a2 * b2 - (((c11 - a1 * b1) - a2 * b1) - a1 * b2);
        
        c2 = a.x * b.y + a.y * b.x;
        
        t1 = c11 + c2;
        e = t1 - c11;
        t2 = a.y * b.y + ((c2 - e) + (c11 - (t1 - e))) + c21;
        
        t.x = t1 + t2;
        t.y = t2 - (t.x - t1);
        
        return t;
    }

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
        // Convert uv*scale (small float) to DS
        
        float dx = uv.x * u_scale;
        float dy = uv.y * u_scale;
        
        vec2 cx = ds_add(u_center_x, vec2(dx, 0.0));
        vec2 cy = ds_add(u_center_y, vec2(dy, 0.0));

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
            // Optimization: could inline
            
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

        gl_FragColor = vec4(color, 1.0);
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
    center: { x: -0.75, y: 0.0 },
    zoom: 1.0,
    palette: 0,
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
    gl.uniform1f(programInfo.uniformLocations.scale, scale);

    gl.uniform1i(programInfo.uniformLocations.palette, state.palette);

    let dynamicIter = 100 + Math.log10(state.zoom) * 150;
    if (dynamicIter < 200) dynamicIter = 200;
    if (dynamicIter > 2500) dynamicIter = 2500;
    gl.uniform1i(programInfo.uniformLocations.maxIterations, Math.floor(dynamicIter));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    updateUI();
}

function updateUI() {
    document.getElementById('zoom-display').innerText = state.zoom.toExponential(2) + "x";
    document.getElementById('pos-display').innerText =
        `${state.center.x.toFixed(10)}, ${state.center.y.toFixed(10)}`;
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

document.getElementById('palette').addEventListener('change', e => {
    state.palette = parseInt(e.target.value);
    requestAnimationFrame(drawScene);
});
document.getElementById('reset-btn').addEventListener('click', () => {
    state.center = { x: -0.75, y: 0.0 };
    state.zoom = 1.0;
    requestAnimationFrame(drawScene);
});

window.addEventListener('resize', drawScene);
requestAnimationFrame(drawScene);
