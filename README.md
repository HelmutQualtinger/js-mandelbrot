# Infinity Mandelbrot - WebGL Explorer

A high-precision interactive Mandelbrot set explorer built with WebGL2 and double-double arithmetic.

## Features

- **High Precision Rendering**: Uses double-double (DD) precision arithmetic via Veltkamp splitting, achieving ~48 bits of mantissa precision (theoretical max zoom: ~2.8e14x)
- **Real-time Interaction**: Smooth panning and zooming with mouse wheel and touch gestures
- **WebGL Acceleration**: GPU-accelerated computation for fast rendering
- **Multiple Color Palettes**: 9 different color schemes including Midnight Fire, Electric Blue, Radioactive, Cotton Candy, Matrix, Sunset, Deep Purple, Golden Hour, and Rainbow
- **High Iteration Count**: Configurable up to 20,000 iterations for ultra-deep zoom exploration
- **Share & Copy**: Generate shareable URLs and copy coordinates for specific locations
- **Responsive Design**: High DPI display support for crisp rendering on modern devices

## Configuration

### Maximum Iterations
- Currently set to **20,000 iterations**
- Shader loop limit: `for(int i = 0; i < 20000; i++)`
- JavaScript cap: `if (dynamicIter > 20000) dynamicIter = 20000;`

### Initial Zoom
- Set to **1x** (full view of the Mandelbrot set)
- Modify `state.zoom` in `mandelbrot.js` to change

## Controls

### Mouse
- **Scroll**: Zoom in/out at cursor position
- **Drag**: Pan around the set

### Touch
- **Two-finger pinch**: Zoom in/out
- **Single finger drag**: Pan around the set

### UI Controls
- **Palette Selector**: Choose from 9 different color schemes
- **Share Button**: Copy a shareable URL with current location
- **Copy Button**: Copy coordinates as text

## Technical Details

### Precision System
The explorer uses double-double arithmetic to achieve extended precision:
- JavaScript (client): Splits with 2^27 + 1 = 134,217,729 (64-bit doubles)
- WebGL Shaders (GPU): Splits with 2^12 + 1 = 4,097 (32-bit floats)

### Dynamic Iteration Scaling
```javascript
let dynamicIter = 100 + Math.log10(state.zoom) * 150;
```
Iterations automatically increase with zoom level, up to the 20,000 maximum.

### Color Palettes
Each palette uses cosine-based function for smooth color transitions:
```glsl
vec3 pal(in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}
```

## File Structure

```
mandelbrot_explorer/
├── index.html       # HTML structure and UI
├── mandelbrot.js    # WebGL rendering and interaction logic
├── style.css        # Styling and layout
└── README.md        # This file
```

## Browser Requirements

- **WebGL 2.0 support** required
- Modern browser (Chrome, Firefox, Safari, Edge)
- JavaScript enabled

## Performance Notes

- Rendering performance depends on GPU capabilities
- Very high zoom levels (>2.8e14x) may show pixelation due to precision limits
- Mobile devices may have reduced performance due to GPU constraints

## Getting Started

1. Open `index.html` in a modern web browser
2. Explore the Mandelbrot set by scrolling to zoom
3. Drag to pan to different areas
4. Use the palette selector to change colors
5. Share interesting locations using the Share button

## Recent Changes

- Maximum iterations increased to 20,000
- Initial zoom set to 1x (full view)
- Enhanced precision rendering with double-double arithmetic

## Future Improvements

- Save/load custom configurations
- Benchmark and optimization tools
- Higher resolution support
- Animation/recording features
