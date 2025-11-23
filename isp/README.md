# Thermal Viewer Web GUI

Browser-based thermal visualization for MLX90642 people detection.

## Overview

Single-file HTML application (~3700 lines) that provides real-time thermal heatmap visualization with people counting. Uses Web Serial API for direct USB communication with STM32 device.

**Key Features:**
- Real-time 32x24 thermal heatmap with bilinear smoothing
- Blob detection overlays with color-coded contours
- 8 preset configurations (mount angle, height, sensitivity)
- Runtime parameter tuning (thresholds, footprint, temperature range)
- Recording/playback with JSON export
- People count history chart
- **🔄 Browser-based firmware updates** (WebUSB DFU)
- **Basic/Advanced UI modes** - Clean interface for beginners, full controls for experts

**Requirements:**
- Chrome 89+ or Edge 89+ (Web Serial API + WebUSB API)
- USB connection to Melexis IO device

**Usage:**
```bash
# Basic mode (default)
open index.html

# Advanced mode (all controls)
open index.html?advanced
```

**UI Modes:**
- **Basic Mode** (default): Shows people count, blobs, temperature range - clean and simple
- **Advanced Mode** (`?advanced`): Shows all 11 runtime parameter sliders, timing metrics, debug output

**Architecture:**
- CONFIG: Centralized configuration constants
- UIManager: Cached DOM elements and UI mode management
- SerialManager: Web Serial API communication (921600 baud)
- ThermalParser: SCPI response parsing
- HeatmapRenderer: Canvas 2D rendering with color gradients
- BlobOverlay: Connected component analysis and contour drawing
- FirmwareUpdater: WebUSB DFU firmware flashing
- Chart.js: Time-series visualization

**Code Quality:**
- JSDoc type annotations on all classes
- No inline event handlers (uses addEventListener)
- Cached DOM references for performance
- Industry-standard separation of concerns

**No build required** - standalone HTML file with embedded JavaScript and CSS.

---

## Firmware Updates

The thermal viewer includes **browser-based firmware updates** using WebUSB and the DFU (Device Firmware Update) protocol. No external tools required!

### Features

- ✅ Automatic update checking on device connect
- ✅ One-click firmware download and flash
- ✅ SHA-256 verification (pre-flash and readback)
- ✅ Progress tracking with real-time status
- ✅ Manual DFU mode fallback instructions
- ✅ Direct integration with GitLab Releases

### Quick Start

#### Option 1: Automatic Update (from GitLab)

1. **Connect Device**
   - Click "Connect" button
   - Select your device's serial port
   - App auto-checks for updates

2. **Update Firmware** (if available)
   - Click "🔄 Update Firmware" button in header
   - Review version information
   - Click "Update Firmware"
   - Confirm warning dialog
   - Wait ~90 seconds for update to complete

3. **Device Reboots**
   - Device automatically reboots to new firmware
   - Click "Reconnect" when prompted

#### Option 2: Manual File Upload (Local)

1. **Download Firmware**
   - Get `.hex` file from GitLab Releases
   - Or build firmware locally

2. **Open Update Modal**
   - Click "🔄 Update Firmware" button

3. **Upload File**
   - Scroll to "Manual Firmware Upload" section
   - Click "📁 Choose Firmware File..."
   - Select your `.hex` file
   - File is validated (size)

4. **Flash Firmware**
   - Click "Update Firmware"
   - Confirm warning dialog
   - Wait ~90 seconds for update

**Use local upload when:**
- Testing locally without network
- GitLab API authentication required
- Installing custom firmware builds
- Network/firewall restrictions

### Update Flow

```
1. Check Version       → Query :PeopleDetection:VERSION? via Serial
2. Fetch Latest        → GitLab API: GET /releases
3. Download HEX        → Download melexis_io_fw.hex
4. Verify Checksum     → (Skipped for HEX files)
5. Enter DFU Mode      → Send :SYSTem:DFU 42 command
6. Connect USB         → WebUSB: 0483:df11 (STM32 BOOTLOADER)
7. Erase + Flash       → DfuSe protocol: 2KB blocks @ 0x08000000
8. Readback Verify     → (Skipped for HEX files)
9. Reboot              → Device exits DFU, starts application
```

### Browser Compatibility

**Supported:**
- ✅ Chrome 89+ (Windows, macOS, Linux)
- ✅ Edge 89+ (Windows, macOS, Linux)

**Not Supported:**
- ❌ Firefox (no WebUSB support)
- ❌ Safari (no WebUSB support)
- ❌ Mobile browsers

### Platform-Specific Setup

#### macOS
✅ **Works out of box** - no driver installation needed

#### Windows
⚠️ **Requires Zadig driver**

1. Download [Zadig](https://zadig.akeo.ie/)
2. Connect device and enter DFU mode:
   - Disconnect USB
   - Press and HOLD BOOT button
   - Connect USB while holding BOOT
   - Release BOOT button
3. Run Zadig:
   - Options → List All Devices
   - Select "STM32 BOOTLOADER"
   - Driver: WinUSB (v6.x.x)
   - Click "Replace Driver"
4. Device is ready for WebUSB updates

#### Linux
⚠️ **Requires udev rules**

Create `/etc/udev/rules.d/50-stm32-dfu.rules`:
```bash
# STM32 DFU Bootloader
SUBSYSTEM=="usb", ATTR{idVendor}=="0483", ATTR{idProduct}=="df11", MODE="0666"
```

Reload rules:
```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

### Manual DFU Mode Entry

If automatic DFU entry fails (`:SYSTem:DFU` command timeout):

1. **Disconnect** USB cable from device
2. **Press and HOLD** the BOOT button on the board
3. **Connect** USB cable while holding BOOT
4. **Release** BOOT button
5. Click **"Retry Update"** in the web interface

Device is now in DFU bootloader mode (VID:PID `0483:df11`)

### Troubleshooting

#### Update Check Fails

**Symptom:** "Failed to fetch GitLab releases" or "Could not fetch GitLab releases. Check network connection."

**Causes:**
- **GitLab API requires authentication** (private repository)
- Network connectivity issue
- GitLab API rate limiting
- CORS/firewall blocking requests

**Solution:**
- **Use manual file upload instead** (recommended for private repos)
  - Download `.hex` from GitLab Releases web page
  - Click "📁 Choose Firmware File..." in update modal
  - Select downloaded file and flash
- Check internet connection
- Try again in a few minutes
- For public repos: Verify GitLab project is accessible

#### DFU Mode Entry Fails

**Symptom:** "Device did not enter DFU mode"

**Causes:**
- Firmware doesn't support `:SYSTem:DFU` command
- USB cable disconnected
- Device crashed before entering DFU

**Solution:**
1. Use manual DFU entry (see above)
2. Check USB cable connection
3. Try different USB port
4. Power cycle device and retry

#### WebUSB Permission Denied

**Symptom:** "No DFU device selected or found"

**Causes:**
- User cancelled USB device picker
- Device not visible in picker
- Browser permissions issue

**Solution:**
1. Click "Update Firmware" again
2. When browser prompts, select "STM32 BOOTLOADER"
3. On Windows: Install Zadig driver (see above)
4. On Linux: Add udev rules (see above)

#### Flash Verification Fails

**Symptom:** "Verification failed at offset 0xXXXX"

**Causes:**
- Flash memory corruption
- USB communication error during write
- Hardware issue

**Solution:**
1. Click "Retry Update" - firmware will re-flash
2. Try different USB port (avoid hubs)
3. If repeated failures, use external flash tool (dfu-util or STM32CubeProgrammer)

#### Device Won't Boot After Update

**Symptom:** Device doesn't respond after update

**Recovery:**
STM32 has **unbrickable ROM bootloader** - device can always be recovered!

1. Enter manual DFU mode (see above)
2. Retry firmware update from web interface
3. If web update fails, use command-line tool:
   
   **Option A: STM32CubeProgrammer (Recommended)**
   Supports `.hex` files natively.
   
   **Option B: dfu-util**
   ⚠️ **Warning:** `dfu-util` treats input files as raw binary. Flashing a `.hex` file directly **will corrupt the firmware** because HEX is text-based. You must use a `.bin` file or convert the HEX first.
   
   ```bash
   # Only for .bin files (NOT .hex):
   dfu-util -a 0 -s 0x08000000:leave -D melexis_io_fw.bin
   ```
4. Download firmware from GitLab Releases if needed

### Firmware File Formats

- **.hex (Intel HEX):** ASCII text format containing data and specific memory addresses. Safe for updates because it allows "gaps" in data (preserving EEPROM/user settings). The Web Tool parses this format.
- **.bin (Binary):** Raw sequence of bytes. No address information. Flashing a `.bin` blindly to `0x08000000` overwrites everything linearly, which may wipe the EEPROM emulation section.
- **.dfu (ST DfuSe):** Binary container format with metadata (Vendor/Product IDs).

### Developer Notes

**DFU Protocol Files:**
- `js/dfu.js` - Core DFU protocol (from [devanlai/webdfu](https://github.com/devanlai/webdfu))
- `js/dfuse.js` - STM32-specific extensions (DfuSe)
- `js/firmware-updater.js` - Update orchestration and GitLab integration

**Memory Layout (STM32F446):**
- Flash start: `0x08000000`
- Flash size: 512 KB
- Transfer size: 2 KB blocks
- Typical firmware size: ~288 KB

**GitLab API Integration:**
- Project ID: `ays/mlx9064x-isp-melexisio`
- Endpoint: `GET /api/v4/projects/{id}/releases`
- Assets: `melexis_io_fw.hex`, `firmware-manifest.json`
- No authentication required (public releases)

**Version Detection:**
- Command: `:PeopleDetection:VERSION?`
- Response format: `Version X.Y.Z | Firmware: gHASH.COMMITS | Build: ISO8601`
- Semantic versioning comparison (major.minor.patch)

---
