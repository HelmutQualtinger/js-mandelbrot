# Claude Guide - Mandelbrot Explorer Development

This document provides guidance for working with the Mandelbrot Explorer project using Claude Code or Claude.

## Project Overview

The Mandelbrot Explorer is a WebGPU-based interactive fractal explorer. All code is contained in a single `index.html` file with inline JavaScript and CSS.

**Key Technologies:**
- WebGPU (GPU rendering)
- WGSL (WebGPU Shading Language)
- Vanilla JavaScript (no frameworks)

## Architecture

### Single-File Structure

```html
<script type="module">
  // Global variables and state
  let centerX, centerY, zoom, maxIter, colorScheme

  // WebGPU shader code (WGSL)
  const shaderCode = `...`

  // Initialization
  async function initWebGPU() { ... }

  // Main render loop
  function render() { ... }

  // Event handlers
  canvas.addEventListener('click', ...)
  canvas.addEventListener('mousemove', ...)
  // ... more event listeners
</script>
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `initWebGPU()` | Initializes WebGPU device, context, and render pipeline |
| `render()` | Updates uniform buffer and executes render pass |
| `calculateIterationsForDisplay()` | Calculates iterations for cursor position (CPU-side) |
| `renderHighRes()` | Renders and exports 8K images |

### State Variables

```javascript
let centerX = -0.5;        // Real part of center
let centerY = 0.0;         // Imaginary part of center
let zoom = 1.0;            // Zoom level (3.0 / zoom = scale factor)
let maxIter = 1000;        // Iteration limit for rendering
let colorScheme = 0;       // Current color palette (0-14)
let isDragging = false;    // Pan mode active
```

## Common Development Tasks

### Adding a New Color Palette

1. Find the `getColor()` function in the shader code
2. Add a new `else if` branch for your color scheme
3. Increment the palette option count in HTML
4. Add a new palette option div in the palette menu

**Example:**
```wgsl
} else if (scheme == 15u) {
    // My New Palette
    let n = t / 100.0;
    return vec3f(
        0.5 + 0.5 * sin(n * 3.14),
        0.2 + 0.3 * cos(n * 2.0),
        0.8 - 0.4 * sin(n * 1.5)
    );
}
```

### Modifying Iteration Range

Change the slider range in the HTML:
```html
<input type="range" id="iterations" min="100" max="5000" value="1000" step="100">
```

Update the escape radius in the shader if needed (currently 256.0):
```wgsl
let escape_radius_sq: f32 = 256.0;
```

### Adding Keyboard Shortcuts

The existing code doesn't have keyboard controls. To add them:

```javascript
window.addEventListener('keydown', (e) => {
    switch(e.key.toLowerCase()) {
        case 'r':
            // Reset
            centerX = -0.5;
            centerY = 0.0;
            zoom = 1.0;
            render();
            break;
        // ... more cases
    }
});
```

### Adjusting Zoom Speed

Click zoom is currently 2x. Modify in the click handler:
```javascript
if (e.shiftKey) {
    zoom /= 2;  // Change the divisor (e.g., 1.5 for slower zoom out)
} else {
    zoom *= 2;  // Change the multiplier (e.g., 1.5 for slower zoom in)
}
```

Wheel zoom factor is 1.1. Modify in the wheel handler:
```javascript
const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;  // Adjust these values
```

## WebGPU Shader Details

### Uniform Buffer Layout

```wgsl
struct Uniforms {
    resolution: vec2f,      // Canvas width, height
    center: vec2f,          // Complex center (Re, Im)
    zoom: f32,              // Zoom level
    maxIterations: u32,     // Iteration limit
    colorScheme: u32,       // Palette index
}
```

**JavaScript side:**
```javascript
const uniformData = new ArrayBuffer(32);  // 32 bytes total
const floatView = new Float32Array(uniformData);
const uintView = new Uint32Array(uniformData);

floatView[0] = canvas.width;      // offset 0
floatView[1] = canvas.height;     // offset 4
floatView[2] = centerX;           // offset 8
floatView[3] = centerY;           // offset 12
floatView[4] = zoom;              // offset 16
uintView[5] = maxIter;            // offset 20
uintView[6] = colorScheme;        // offset 24
// bytes 28-31 are padding
```

### Coordinate Conversion

Converting screen pixel to Mandelbrot coordinates:

```javascript
const px = (e.clientX - rect.left) / rect.width;  // 0 to 1
const py = (e.clientY - rect.top) / rect.height;   // 0 to 1

const uvx = (px - 0.5) * 2.0;  // -1 to 1 (normalized device coords)
const uvy = (py - 0.5) * 2.0;  // -1 to 1

const aspect = canvas.width / canvas.height;
const scale = 3.0 / zoom;  // Scale factor (inverse of zoom)

const re = centerX + uvx * scale * aspect / 2.0;
const im = centerY - uvy * scale;  // Note: uvy is inverted for math coords
```

### Mandelbrot Iteration (CPU-side)

Used for the cursor display. Must match the shader algorithm:

```javascript
function calculateIterationsForDisplay(cx, cy, maxIterations) {
    let zx = 0.0, zy = 0.0;
    let iter = 0;
    const escapeRadius = 256.0;

    for (iter = 0; iter < maxIterations; iter++) {
        const zx2 = zx * zx;
        const zy2 = zy * zy;

        if (zx2 + zy2 > escapeRadius) break;

        // z_new = z^2 + c
        const temp = zx2 - zy2 + cx;
        zy = 2.0 * zx * zy + cy;
        zx = temp;
    }
    return iter;
}
```

## Debugging Tips

### Check WebGPU Support

```javascript
if (!navigator.gpu) {
    console.error('WebGPU not supported');
}
```

### Monitor Shader Errors

Shader compilation errors appear in the status element:
```html
<span id="status">Initialisiere WebGPU...</span>
```

Check the browser console for detailed error messages.

### Performance Profiling

- Open browser DevTools (F12)
- Check Performance tab during rendering
- Monitor GPU usage and frame rate
- Check if iterations slider or zoom is causing bottlenecks

### Real-time Debug Information

The cursor display shows:
- Current Re, Im coordinates
- Iteration count at that position

Use this to verify coordinate transformations are correct.

## Testing Changes

1. Edit `index.html`
2. Refresh the browser (Ctrl+R or Cmd+R)
3. Hard refresh if needed (Ctrl+Shift+R) to clear cache
4. Check browser console for errors (F12 → Console tab)

## Common Issues and Solutions

### Issue: Iterations not updating
**Solution:** Check that `calculateIterationsForDisplay()` is being called in the mousemove handler and that the escape radius matches the shader value.

### Issue: Colors look wrong
**Solution:**
- Verify the palette index is correct (0-14)
- Check that color scheme uniforms are being set: `uintView[6] = colorScheme;`
- Verify the palette-option data attributes match shader conditions

### Issue: Zoom feels wrong or inverted
**Solution:** Check the coordinate conversion formula, especially:
- `scale = 3.0 / zoom` (makes sure 3.0 is consistent with shader)
- `uvy = (py - 0.5) * 2.0` (note: Y is inverted)
- The aspect ratio calculation

### Issue: GPU memory errors
**Solution:** The uniform buffer is only 32 bytes. Ensure struct size doesn't exceed this.

## Making Modifications

### General Workflow

1. Read the relevant section (shader or JavaScript)
2. Make targeted changes (avoid refactoring large sections)
3. Test in browser immediately
4. Commit changes with clear messages

### Tips for Modifications

- **Shader changes:** Changes take effect immediately after page refresh
- **JavaScript changes:** Most changes take effect on page refresh
- **HTML changes:** Always require refresh
- **Keep state variables consistent:** If you change centerX calculation, verify all uses are updated

### Performance Considerations

- Cursor iteration calculation runs every mousemove → keep it efficient
- Reduce iteration count for smoother interaction
- Complex color palettes have no performance impact (GPU-bound)
- High resolution export (8K) takes several seconds

## File Size and Optimization

Current `index.html` is optimized for clarity. It contains:
- HTML structure (~200 lines)
- Inline CSS (~130 lines)
- Inline JavaScript (~1000+ lines)
- WGSL shader code (~450 lines)

Total is still manageable for a single file. If it becomes too large, consider splitting into separate files (requires `<script type="module">` and imports).

## References

- **WebGPU Documentation:** https://www.w3.org/TR/webgpu/
- **WGSL Spec:** https://www.w3.org/TR/WGSL/
- **Mandelbrot Algorithm:** Standard recursive formula z_new = z^2 + c
- **Complex Number Arithmetic:** Real and imaginary components are handled separately

## Quick Command Reference

### Canvas Event Types
- `click` - Single click (zoom)
- `mousemove` - Cursor movement (drag or display info)
- `mousedown/mouseup` - Track drag state
- `wheel` - Scroll wheel zoom
- `touchstart/touchmove/touchend` - Touch gestures
- `contextmenu` - Right-click menu suppression

### Uniform Buffer Write

```javascript
device.queue.writeBuffer(uniformBuffer, 0, uniformData);
```

Always call this after updating uniform values.

### Render Pass Setup

```javascript
const renderPass = commandEncoder.beginRenderPass({
    colorAttachments: [{
        view: textureView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
    }]
});
```

This clears to black and stores the result.

---

**Last Updated:** 2026-01-04
**Version:** WebGPU 1.0
