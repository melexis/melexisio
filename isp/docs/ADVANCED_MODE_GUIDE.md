# Advanced Mode Guide

Complete reference for all tuning parameters in the MLX9064x Thermal Viewer.

---

## Table of Contents

1. [Enabling Advanced Mode](#enabling-advanced-mode)
2. [Frame Rate Control](#frame-rate-control)
3. [Sensor Configuration](#sensor-configuration)
4. [Shared Parameters](#shared-parameters) *(both modes)*
5. [Default Mode Parameters](#default-mode-parameters)
6. [Simple Mode Parameters](#simple-mode-parameters)
7. [Tuning Scenarios](#tuning-scenarios)
8. [Reset to Defaults](#reset-to-defaults)

---

## Enabling Advanced Mode

Add `?advanced` to the URL:

```
https://www.melexis.io/isp/?advanced
```

Or on internal GitLab Pages:

```
https://ays.pages.melexis.com/mlx9064x-isp-melexisio/?advanced
```

**What changes:**
- Advanced panel appears on the right side
- All runtime parameter sliders become visible
- Debug output panel appears at the bottom
- Performance statistics become visible

---

## Frame Rate Control

### Capture Frame Rate Slider

| Range | Default | Effect |
|-------|---------|--------|
| 1.0 - 16.0 Hz | 8.0 Hz | How often the viewer requests frames |

**Considerations:**
- Higher = smoother display, more CPU usage
- Lower = less responsive, lower CPU usage
- Actual rate limited by sensor configuration

---

## Sensor Configuration

### Sensor Frame Rate

| Option | Actual Rate | Best For |
|--------|-------------|----------|
| 2 Hz | 2 frames/second | Low power, slow scenes |
| 4 Hz | 4 frames/second | Standard monitoring |
| **8 Hz** | 8 frames/second | General use (default) |
| 16 Hz | 16 frames/second | Fast-moving scenes |

**Note:** Higher sensor rates consume more power and may increase noise.

### Apply Sensor Config

Click **Apply** to send new sensor configuration to the device.

---

## Shared Parameters

*Available in both Default and Simple modes*

These parameters affect detection in both algorithm modes.

### Footprint Size

| Range | Default | Unit |
|-------|---------|------|
| 35 - 90 | 60 | pixels |

**What it does**: Expected size of one person in pixels.

**Effect on counting:**
- **Lower value** → Counts smaller heat regions as people
- **Higher value** → Requires larger heat regions to count as person

**When to adjust:**
- People appear smaller than expected → Decrease
- Multiple people counted as one → Decrease
- Noise counted as people → Increase

---

### Min Blob Area

| Range | Default | Unit |
|-------|---------|------|
| 5 - 100 | 15 | pixels |

**What it does**: Ignores heat regions smaller than this.

**Effect:**
- **Lower value** → Detects smaller blobs (more sensitive, more noise)
- **Higher value** → Only detects larger blobs (less noise, may miss distant people)

**When to adjust:**
- False detections from small heat sources → Increase
- Missing people at far distance → Decrease

---

## Default Mode Parameters

*These parameters are only visible when Algorithm Mode = Default*

### Cold Threshold

| Range | Default | Display |
|-------|---------|---------|
| 0.004 - 4.0 | 1.0× | Multiplier |

**What it does**: Controls how much colder than background a region must be to trigger cold detection.

**How it works**: The algorithm calculates the scene's typical temperature variation (noise level). This multiplier sets the detection threshold relative to that noise. At 1.0×, regions must be colder than the noise level. At 2.0×, they must be twice as cold. Values below 0.5× are for advanced debugging only.

**Effect:**
- **Lower value** → More sensitive to cold (detects smaller temperature differences)
- **Higher value** → Less sensitive (only detects significantly colder regions)

**Note:** Cold detection must be enabled in presets for this to have effect.

---

### Hot Threshold

| Range | Default | Display |
|-------|---------|---------|
| 0.004 - 4.0 | 1.0× | Multiplier |

**What it does**: Controls how much warmer than background a region must be to detect as a person.

**How it works**: The algorithm calculates the scene's typical temperature variation (noise level). This multiplier sets the detection threshold relative to that noise. At 1.0×, people must be warmer than the noise level. At 2.0×, they must be twice as warm. Values below 0.5× are for advanced debugging only.

**Effect:**
- **Lower value** → More sensitive (detects people with smaller temperature difference from background)
- **Higher value** → Less sensitive (only detects people who are significantly warmer)

**When to adjust:**
- Missing people → Decrease
- Detecting warm objects that aren't people → Increase

---

### Temperature Range

#### Min Temperature

| Range | Default | Display |
|-------|---------|---------|
| 0 - 30°C | 22.0°C | Celsius |

**What it does**: Ignore pixels colder than this temperature. Set to 0 for Auto (defaults to 20°C internally).

**When to adjust:**
- Detecting cold floor/walls → Increase
- Missing people in cold environments → Decrease

---

#### Max Temperature

| Range | Default | Display |
|-------|---------|---------|
| 0 - 50°C | 33.0°C | Celsius |

**What it does**: Ignore pixels hotter than this temperature. Set to 0 for Auto (defaults to 40°C internally).

**When to adjust:**
- Detecting hot equipment → Decrease
- Missing people near heat sources → Increase

---

### Background Learning

#### Learning Rate (gamma_ema)

| Range | Default | Display |
|-------|---------|---------|
| 0.01 - 0.50 | 0.10× | Multiplier |

**What it does**: How quickly the background model adapts to changes.

**Effect:**
- **Lower value** → Slower adaptation, preserves standing people longer
- **Higher value** → Faster adaptation, absorbs stationary people

**When to adjust:**
- Standing people disappear → Decrease significantly (try 0.01-0.05)
- Scene changes aren't recognized → Increase

**Convergence times (approximate):**
| Value | Time to absorb stationary object |
|-------|----------------------------------|
| 0.01× | ~230 frames (~30 seconds at 8Hz) |
| 0.05× | ~46 frames (~6 seconds) |
| 0.10× | ~23 frames (~3 seconds) |
| 0.25× | ~9 frames (~1 second) |

---

### Advanced Blob Detection Parameters

*For expert tuning only. These control the internal blob detection algorithm.*

#### Cold Gate

| Range | Default | Effect |
|-------|---------|--------|
| 5 - 500 | 50 | Minimum cold pixels to enable cold detection |

- **5** → Always enable cold detection
- **50** → Only for significant cold regions (balanced)
- **500** → Effectively disable cold detection

---

#### Hot Gate

| Range | Default | Effect |
|-------|---------|--------|
| 5 - 100 | 5 | Minimum hot pixels to enable hot detection |

- **5** → Always enable hot detection (recommended)
- **Higher** → Only for larger hot regions

---

#### Cold Percentile / Hot Percentile

| Range | Default | Effect |
|-------|---------|--------|
| 0.0 - 1.0 | 0.5 | Detection threshold strictness |

- **Lower** → More sensitive (more detections)
- **Higher** → Stricter (fewer false positives)

---

## Simple Mode Parameters

*These parameters are only visible when Algorithm Mode = Simple*

### Hot Threshold

| Range | Default | Unit |
|-------|---------|------|
| 0 - 10.0 | 2.0 | °C |

**What it does**: Temperature difference from background to detect as person.

**Effect:**
- **Lower value** → Detects cooler people (more sensitive)
- **Higher value** → Only detects warmer people (less noise)

**When to adjust:**
- Missing people → Decrease
- False detections → Increase

---

### Cold Threshold

| Range | Default | Unit |
|-------|---------|------|
| 0 - 10.0 | 0 (off) | °C |

**What it does**: Temperature difference below background to detect.

**Note:** Set to 0 to disable cold detection.

---

### Hysteresis (Strong Threshold)

| Range | Default | Display |
|-------|---------|---------|
| 1.0 - 4.0 | 1.0× | Multiplier of Hot Threshold |

**What it does**: Sets a second, higher threshold for confirming new detections.

**How it works**: To avoid flickering, the algorithm uses two thresholds. A blob must first exceed this "strong" threshold (Hot Threshold × this multiplier) to be initially detected. Once detected, it only needs to stay above the regular Hot Threshold to remain detected. This prevents detections from appearing and disappearing rapidly when temperatures hover near the threshold.

**Effect:**
- **Higher value** → Requires stronger initial signal to start detection (more stable, but may miss weak signals)
- **Lower value** → Easier to start new detections (more responsive, but may flicker)

---

### BG Learning

| Range | Default | Display |
|-------|---------|---------|
| 0.01 - 0.50 | 0.10× | Multiplier |

**What it does**: How quickly the background model adapts to changes. Same parameter as Default mode's Learning Rate.

**Effect:**
- **Lower value** → Slower adaptation, preserves standing people longer
- **Higher value** → Faster adaptation, absorbs stationary people

---

### Motion Settings

#### Motion Threshold

| Range | Default | Unit |
|-------|---------|------|
| 0 - 10.0 | 1.0 | °C |

**What it does**: Temperature change required to register as motion.

**Effect:**
- **Lower value** → Detects subtle movements
- **Higher value** → Only detects significant movements

---

#### Motion Persistence

| Range | Default | Unit |
|-------|---------|------|
| 1 - 180 | 60 | seconds |

**What it does**: How long motion "memory" persists after movement stops.

**Effect:**
- **Lower value** → Motion quickly forgotten (static objects ignored faster)
- **Higher value** → Motion remembered longer (standing people kept active)

**When to adjust:**
- Standing people disappear too quickly → Increase
- Static heat sources detected as people → Decrease

---

#### Motion Validation

| State | Effect |
|-------|--------|
| **Off** | All warm regions detected regardless of motion |
| **On** | Only regions with recent motion are detected |

**Use case:** Enable to ignore static heat sources (radiators, monitors).

---

### Adaptive Threshold

Auto-adjusts detection sensitivity based on scene conditions.

#### Enable Adaptive Threshold

| State | Effect |
|-------|--------|
| **Off** | Uses fixed Hot Threshold value |
| **On** | Calculates threshold from scene noise |

**When to enable:** Scenes with varying noise levels (e.g., outdoor, HVAC interference).

---

#### K Sigma

| Range | Default | Effect |
|-------|---------|--------|
| 1.5 - 5.0 | 3.0× | Multiplier for noise-based threshold |

**How it works**: The algorithm measures the scene's background noise level (sigma). The adaptive threshold is set to K × sigma. At 3.0×, temperatures must be 3 times the noise level above background to be detected. This automatically adjusts for noisy vs quiet scenes.

- **Lower value** → More sensitive (detects smaller differences, but more false positives in noisy scenes)
- **Higher value** → Less sensitive (only strong signals detected, fewer false positives)

**Recommendation:** Start with 3.0, decrease if missing people, increase if too many false detections.

---

#### Threshold Min

| Range | Default | Unit |
|-------|---------|------|
| 0.5 - 3.0 | 1.8 | °C |

**What it does**: Minimum adaptive threshold (floor).

**Effect:** Prevents threshold from becoming too sensitive in quiet scenes.

---

#### Threshold Max

| Range | Default | Unit |
|-------|---------|------|
| 2.0 - 8.0 | 7.0 | °C |

**What it does**: Maximum adaptive threshold (ceiling).

**Effect:** Prevents threshold from becoming too strict in noisy scenes.

---

### Tracking Settings

#### Min Track Age

| Range | Default | Unit |
|-------|---------|------|
| 0.1 - 5.0 | 1.0 | seconds |

**What it does**: How long a detection must exist before counted as person.

**Effect:**
- **Lower value** → Faster response, more transient detections
- **Higher value** → More stable counts, slower response

---

#### Max Track Missed

| Range | Default | Unit |
|-------|---------|------|
| 0.1 - 10.0 | 1.0 | seconds |

**What it does**: How long to remember a person after they disappear.

**Effect:**
- **Lower value** → People dropped quickly when occluded
- **Higher value** → People remembered through brief occlusions

---

## Tuning Scenarios

### Scenario: Missing People

**Symptoms:** People walk through but aren't detected.

**Try in order:**
1. Decrease Hot Threshold
2. Decrease Min Blob Area
3. Check Temperature Range includes human body temp
4. Increase sensitivity in presets (Default mode)

---

### Scenario: Too Many False Detections

**Symptoms:** Static objects detected as people.

**Try in order:**
1. Enable Motion Validation (Simple mode)
2. Increase Min Blob Area
3. Increase Hot Threshold
4. Narrow Temperature Range

---

### Scenario: Standing People Disappear

**Symptoms:** Stationary people stop being detected after some time.

**Try:**
1. Decrease Learning Rate (try 0.01-0.03)
2. Increase Motion Persistence (Simple mode)

---

### Scenario: Flickering Counts

**Symptoms:** People count jumps up and down rapidly.

**Try:**
1. Increase Hysteresis (Simple mode)
2. Increase Min Track Age
3. Increase Max Track Missed

---

### Scenario: Heat Sources Detected as People

**Symptoms:** Radiators, monitors, or sunlit areas trigger false detections.

**Try:**
1. Enable Motion Validation (Simple mode)
2. Narrow Temperature Range (lower max temp)
3. Increase Hot Threshold

---

## Reset to Defaults

Click **Reset to Defaults** to restore all parameters to factory values.

**Note:** This affects runtime parameters only. Preset configuration (angle, height, sensitivity) is preserved.

---

## Debug Information

### Performance Stats (visible in Advanced mode)

| Stat | Meaning |
|------|---------|
| **Process Time** | Algorithm processing time per frame |
| **Frame Time** | Total time between frames |
| **FPS** | Actual frames per second |

### Adaptive Threshold Display

When adaptive threshold is enabled, the current calculated threshold appears next to the temperature range.

### Debug Output

Text panel at bottom shows raw communication with device. Useful for debugging connection issues.

---

## Related Guides

- **[Basic Mode Guide](BASIC_MODE_GUIDE.md)** - Standard controls reference
- **[Firmware Update](FIRMWARE_UPDATE.md)** - Update device firmware

---

*To return to Basic mode, remove `?advanced` from the URL.*
