# MLX9064x Thermal Viewer

Browser-based thermal visualization with real-time people counting for MLX90642 sensors.

---

## Quick Start

1. Open `index.html` in **Chrome 89+** or **Edge 89+**
2. Click **Connect** → Select your device
3. Click **Start Capture**
4. View people count and thermal heatmap

---

## Requirements

| Requirement | Details |
|-------------|---------|
| **Browser** | Chrome 89+ or Edge 89+ (Firefox/Safari not supported) |
| **Device** | Melexis IO board with USB connection |
| **Connection** | USB cable (data-capable) |

---

## User Guides

| Guide | Description |
|-------|-------------|
| **[Basic Mode](docs/BASIC_MODE_GUIDE.md)** | Standard controls and presets |
| **[Advanced Mode](docs/ADVANCED_MODE_GUIDE.md)** | All tuning parameters |
| **[Firmware Update](docs/FIRMWARE_UPDATE.md)** | Update device firmware |

---

## Features

- **Real-time thermal heatmap** - 32×24 sensor visualization with bilinear smoothing
- **People counting** - Automatic detection with blob tracking
- **Two algorithm modes** - Default (preset-based) and Simple (threshold-based)
- **Visualization options** - Motion overlay, fixed color scale, orientation controls
- **Recording** - Capture sessions to JSON for later analysis
- **Browser firmware updates** - One-click updates via WebUSB

---

## UI Modes

| Mode | How to Access | Features |
|------|---------------|----------|
| **Basic** | Default | Clean interface with essential controls |
| **Advanced** | Add `?advanced` to URL | All runtime parameter sliders |

---

## Architecture

Single-file HTML application with embedded JavaScript:

- **SerialManager** - Web Serial API communication (921600 baud)
- **HeatmapRenderer** - Canvas 2D with color gradients
- **BlobOverlay** - Connected component visualization
- **FirmwareUpdater** - WebUSB DFU protocol

No build required - standalone HTML file.

---

## License

See project root for license information.
