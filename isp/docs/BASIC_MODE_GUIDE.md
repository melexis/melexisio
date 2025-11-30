# Basic Mode Guide

Complete reference for all standard controls in the MLX9064x Thermal Viewer.

---

## Table of Contents

1. [Connection Controls](#connection-controls)
2. [Capture Controls](#capture-controls)
3. [Algorithm Mode](#algorithm-mode)
4. [Preset Configuration](#preset-configuration)
5. [Display Statistics](#display-statistics)
6. [Visualization Options](#visualization-options)
7. [Recording](#recording)

---

## Connection Controls

### Connect / Disconnect Button

| State | Button Text | Action |
|-------|-------------|--------|
| Disconnected | **Connect** | Opens device selector popup |
| Connected | **Disconnect** | Closes connection to device |

**How to connect:**
1. Click **Connect**
2. Browser shows available serial ports
3. Select your Melexis IO device
4. Wait for connection confirmation

**Connection indicators:**
- Library version appears in header when connected
- Capture button becomes enabled

---

## Capture Controls

### Start / Stop Capture

| State | Button Text | Action |
|-------|-------------|--------|
| Stopped | **Start Capture** | Begins receiving thermal frames |
| Running | **Stop Capture** | Pauses thermal display |

**While capturing:**
- Thermal heatmap updates continuously
- People count refreshes each frame
- Statistics update in real-time

---

## Algorithm Mode

### Mode Selection Dropdown

Choose how people are detected:

| Mode | Best For | Description |
|------|----------|-------------|
| **Default** | Most scenarios | Advanced detection with tracking and presets |
| **Simple** | Low-resource, experimental | Lightweight threshold-based detection |

> **Switching modes** requires the algorithm to reinitialize. Detection may pause briefly.

---

## Preset Configuration

*Only available in Default mode*

Presets automatically configure detection parameters based on your installation:

### Mount Angle

| Option | Use When |
|--------|----------|
| **Vertical** | Sensor mounted on ceiling, looking straight down |
| **Oblique** | Sensor mounted on wall, looking at an angle |

**Effect**: Adjusts how the system interprets blob shapes.

### Mount Height

| Option | Use When |
|--------|----------|
| **Short** | Sensor is less than 2.5 meters from floor |
| **Tall** | Sensor is 2.5 meters or higher |

**Effect**: Adjusts expected person size in pixels. Higher mounts see smaller people.

### Sensitivity

| Option | Effect |
|--------|--------|
| **Low** | Fewer false detections, may miss some people |
| **High** | Detects more people, may have false positives |

**Recommendation**: Start with **Low**, increase if people are missed.

### Cold Detection

| State | Behavior |
|-------|----------|
| **Off** (default) | Only detects warm objects |
| **On** | Also detects cold shadows (e.g., air conditioning draft) |

**When to enable**: Environments with significant cold air flow that creates detection shadows.

### Applying Presets

Presets are applied automatically when you change any toggle. The system may briefly reinitialize.

---

## Display Statistics

### Stats Panel

| Stat | Meaning |
|------|---------|
| **People** | Number of people currently detected |
| **Blobs** | Number of distinct heat regions (may differ from people count) |
| **Temp Range** | Lowest to highest temperature in current frame (e.g., "22.5 - 32.1°C") |

### Understanding the Numbers

- **People ≤ Blobs**: Multiple heat sources may be detected, but only some are classified as people
- **People > 1 per blob**: Large blobs may contain multiple people standing together
- **Temp Range**: Useful for monitoring scene conditions

---

## Visualization Options

### Display Motion Map

| State | Effect |
|-------|--------|
| **Off** | Shows only temperature data |
| **On** | Overlays motion detection (areas with recent movement) |

**Use case**: Debugging detection issues, understanding what triggers motion.

### Fixed Color Scale

| State | Effect |
|-------|--------|
| **Off** | Colors auto-adjust to current min/max temperature |
| **On** | Colors stay consistent across frames |

When **On**, you can set:

| Control | Range | Description |
|---------|-------|-------------|
| **Min Temp** | 0-50°C | Temperature mapped to blue |
| **Max Temp** | 0-50°C | Temperature mapped to red |

**Recommendation**:
- Use **Off** for exploring new scenes
- Use **On** for consistent monitoring

### Smooth Heatmap

| State | Effect |
|-------|--------|
| **Off** | Shows raw 32×24 pixels (blocky) |
| **On** | Applies bilinear interpolation (smooth gradients) |

**Use case**: Smooth looks better, but raw shows actual sensor resolution.

### Orientation Controls

Adjust the display to match your installation:

| Control | Effect |
|---------|--------|
| **Flip Horizontal** | Mirror image left-to-right |
| **Flip Vertical** | Mirror image top-to-bottom |
| **Rotate 90°** | Rotate display 90 degrees clockwise |

**Use case**: Match the thermal view to your physical camera orientation.

---

## Recording

Capture thermal sessions for later review.

### Recording Controls

| Button | Action |
|--------|--------|
| **Record** | Start recording frames (disabled until capturing) |
| **Stop** | Stop recording |
| **Save** | Export recorded frames to JSON file |

### Recording Workflow

1. Start capture (thermal must be running)
2. Click **Record**
3. Frame counter shows recorded frame count
4. Click **Stop** when done
5. Click **Save** to download JSON file

### Recorded Data

The JSON file contains:
- Raw thermal frame data
- Detection results (blobs, people count)
- Timestamps

**Use case**: Analyze detection performance, share scenarios for debugging.

---

## Tips for Best Results

### Optimal Setup
- Position sensor to view full area of interest
- Avoid pointing directly at heat sources (radiators, sunlight)
- Ensure people walk through the field of view

### Improving Detection
- **Missing people?** Try increasing sensitivity or checking temperature range
- **False detections?** Lower sensitivity or enable motion validation
- **Inconsistent counts?** Check mount height setting matches your installation

### Performance
- Close other browser tabs for best frame rate
- Use wired USB connection (avoid hubs if possible)

---

## Related Guides

- **[Firmware Update](FIRMWARE_UPDATE.md)** - Update device firmware

---

*Need more control? Add `?advanced` to the URL to access [Advanced Mode](ADVANCED_MODE_GUIDE.md).*
