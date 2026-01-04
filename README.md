# Mandelbrot Explorer - WebGPU Version

A high-precision interactive Mandelbrot set explorer built with WebGPU for modern browsers.

## Features

- **WebGPU Rendering**: Next-generation GPU acceleration for high-performance fractal rendering
- **Real-time Cursor Display**: Live iteration counter and complex plane coordinates (Re, Im) as you move your cursor
- **Interactive Navigation**:
  - Click to zoom in, Shift+Click to zoom out
  - Right-click or middle-click to pan
  - Mouse wheel for smooth zooming
  - Touch gestures (pinch-to-zoom, drag-to-pan)
- **Multiple Color Palettes**: 15 different color schemes including Classic, Fire, Ocean, Ultraviolet, Rainbow, Grayscale, Sunset, Forest, Neon, Ice, Lava, Purple Haze, Copper, Electric, and Jade
- **Configurable Iterations**: Adjustable iteration count (100-5000) to control detail level
- **High-Resolution Export**: Save 8K HEIF/JPEG images of your explorations
- **Keyboard Shortcuts**: Quick navigation and controls
- **Responsive Design**: Works on desktop and tablet devices

## Configuration

### Iteration Range
- Adjustable from **100 to 5,000 iterations**
- Controlled via the slider in the control panel
- More iterations reveal finer detail but take longer to compute

### Initial View
- Centered at (-0.5, 0.0) with 1x zoom
- Shows the full classic view of the Mandelbrot set
- Click "Zurücksetzen" (Reset) button to return to initial view

## Controls

### Mouse
- **Left Click**: Zoom in at clicked position
- **Shift + Left Click**: Zoom out (2x)
- **Right Click / Middle Click + Drag**: Pan around the set
- **Mouse Wheel**: Smooth zoom in/out at cursor position
- **Cursor Movement**: Display real-time iteration count and coordinates (Re, Im)

### Touch
- **Single Finger Drag**: Pan around the set
- **Two-Finger Pinch**: Zoom in/out

### UI Controls
- **Iterationen Slider**: Adjust iteration count (100-5000)
- **Farbpalette Button**: Choose from 15 different color schemes
- **8K HEIF speichern**: Export current view as high-resolution image
- **Zurücksetzen Button**: Reset to initial view
- **Cursor Info Display**: Shows real-time Re, Im, and iteration count for pixel under cursor

## Technical Details

### WebGPU Rendering
- Implements the Mandelbrot algorithm using WGSL (WebGPU Shading Language)
- Uniform buffers store center coordinates, zoom level, and iteration count
- Fragment shader computes iterations per pixel for real-time rendering
- Smooth coloring using logarithmic iteration interpolation

### Cursor Iteration Calculation
- JavaScript performs real-time iteration calculation as cursor moves
- Uses the same Mandelbrot algorithm as the GPU shader for consistency
- Coordinates are converted from screen space to complex plane coordinates
- Results displayed with 6 decimal places precision

### Color Palettes
Supports 15 different color schemes with various mathematical color functions:
- Trigonometric-based palettes (Classic, Ocean, Neon, etc.)
- Procedural palettes with smooth transitions
- Each palette optimized for visual appeal at different zoom levels

## File Structure

```
mandelbrot_explorer/
├── index.html       # HTML structure, WebGPU rendering, and all interaction logic
└── README.md        # This file
```

## Browser Requirements

- **WebGPU support** required
- Modern browser: Chrome/Edge (v113+), Firefox (experimental), Safari (upcoming)
- JavaScript enabled
- GPU with WebGPU capabilities

## Performance Notes

- Rendering performance depends on GPU capabilities
- Higher iteration counts and extreme zoom levels will reduce frame rate
- WebGPU offloads computation to GPU for efficient real-time rendering
- Cursor iteration calculation runs on CPU and is optimized for low latency

## Getting Started

1. Open `index.html` in a WebGPU-capable browser
2. Move your cursor over the canvas to see real-time iteration and coordinate data
3. Click to zoom in, Shift+Click to zoom out
4. Use the right mouse button to pan around
5. Adjust the iteration slider to control detail level
6. Use the palette selector to try different color schemes
7. Export interesting views as 8K images using the save button

## Recent Changes

- Implemented WebGPU rendering for next-generation GPU acceleration
- Added real-time cursor display showing iteration count and complex coordinates (Re, Im)
- Updated to 15 color palettes for WebGPU version
- Streamlined UI with German language labels
- Added 8K HEIF/JPEG export functionality

## Known Limitations

- WebGPU support is still emerging; not available in all browsers
- Precision is limited by GPU float precision (typically 32-bit)
- Very deep zooms may exhibit floating-point artifacts

## Future Improvements

- Extended precision arithmetic for deeper zooms
- Animation/zoom recording features
- Custom coordinate input
- Performance profiling tools
- Additional color palette options
