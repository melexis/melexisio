# Basic Mode Guide

Complete reference for all standard controls in the MLX9064x Thermal Viewer.

---

## Table of Contents

1. [Connection Controls](#connection-controls)
2. [Capture Controls](#capture-controls)
3. [Algorithm Mode](#algorithm-mode)
4. [Simple Mode Configuration](#simple-mode-configuration) *(Simple mode only)*
5. [Preset Configuration](#preset-configuration) *(Default mode only)*
6. [Display Statistics](#display-statistics)
7. [Visualization Options](#visualization-options)
8. [Recording](#recording)

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

### What Changes Per Mode

| Feature | Default Mode | Simple Mode |
|---------|--------------|-------------|
| Configuration | Preset options (angle, height, sensitivity) | Hot Threshold slider + Motion Validation |
| Detection Method | Scene analysis finds warm bodies automatically | Direct temperature threshold you control |
| Best For | Accurate counting with minimal setup | Fine-tuned control, experimental scenes |

**Default mode** analyzes the thermal scene to build a background model and detect people as warm regions that stand out. Configure it using the Preset options below.

**Simple mode** uses a direct temperature difference from background. Configure it using the Simple Mode options below.

---

## Simple Mode Configuration

*Only available in Simple mode*

When you select Simple mode, these controls appear instead of Preset Configuration:

### Hot Threshold

| Range | Default | Unit |
|-------|---------|------|
| 0 - 10.0 | 2.0 | °C |

**What it does**: Sets how much warmer than the background a region must be to detect as a person.

**How it works**: The algorithm learns what the "empty" scene looks like (the background). When something warmer appears, it's detected if the temperature difference exceeds this threshold. A person typically appears 2-5°C warmer than the background.

**When to adjust:**
- **Missing people?** → Decrease (try 1.5°C or lower)
- **False detections from warm objects?** → Increase (try 2.5-3.0°C)

### Motion Validation

| State | Behavior |
|-------|----------|
| **Off** (default) | Detects all warm regions above threshold |
| **On** | Only detects warm regions that have recently moved |

**How it works**: When enabled, a warm region must show temperature changes (motion) to be counted as a person. Static warm objects like radiators, monitors, or sunlit areas are ignored.

**When to enable**:
- Scene has static heat sources causing false detections
- You only need to count people who are moving

**When to keep off**:
- You need to detect standing/stationary people
- Scene has no problematic static heat sources

---

## Preset Configuration

*Only available in Default mode*

Presets automatically configure detection parameters based on your installation:

### Mount Angle

| Option | Use When |
|--------|----------|
| **Vertical** | Sensor mounted on ceiling, looking straight down |
| **Oblique** | Sensor mounted on wall, looking at an angle |

**How it works**: When looking straight down (Vertical), people appear as round shapes. When looking at an angle (Oblique), people appear elongated. This setting helps the algorithm correctly identify person shapes for your installation.

### Mount Height

| Option | Use When |
|--------|----------|
| **Short** | Sensor is less than 2.5 meters from floor |
| **Tall** | Sensor is 2.5 meters or higher |

**How it works**: The further the sensor is from people, the smaller they appear in the thermal image. This setting tells the algorithm how large a person should look, so it can count them correctly.

### Sensitivity

| Option | Effect |
|--------|--------|
| **Low** | Fewer false detections, may miss some people |
| **High** | Detects more people, may have false positives |

**Recommendation**: Start with **Low**, increase if people are missed.

### Cold Detection

| State | Behavior |
|-------|----------|
| **Off** (default) | Only detects warm objects (people, heat sources) |
| **On** | Also detects cold regions (useful in some special scenarios) |

**How it works**: Normally, people are warmer than the background and show up as "hot spots". In some environments (e.g., strong air conditioning), cold air can create distinct cold regions. Enable this only if instructed for specific use cases. Most installations should leave this **Off**.

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
| **On** | Highlights areas with recent movement, dims static areas |

**How it works**: The system tracks which areas have had temperature changes (motion). When enabled, areas with recent motion appear at full brightness, while static (non-moving) areas appear slightly muted/faded. This helps you see which regions the algorithm considers "active" - useful for understanding why certain areas trigger detections.

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

### Improving Detection (Default Mode)
- **Missing people?** Try increasing Sensitivity to **High**
- **False detections?** Lower Sensitivity to **Low**, or check if a heat source (radiator, sunlight) is in view
- **Inconsistent counts?** Verify Mount Height and Mount Angle match your actual installation

### Improving Detection (Simple Mode)
- **Missing people?** Lower the Hot Threshold (try 1.5°C or below)
- **False detections from static objects?** Enable **Motion Validation** to ignore non-moving heat sources
- **False detections from warm objects?** Increase Hot Threshold (try 2.5-3.0°C)

### Performance
- Close other browser tabs for best frame rate
- Use wired USB connection (avoid hubs if possible)

---

## Related Guides

- **[Firmware Update](FIRMWARE_UPDATE.md)** - Update device firmware
