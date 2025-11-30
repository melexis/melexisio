# Firmware Update Guide

Update your Melexis IO device firmware directly from the browser.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Update (Automatic)](#quick-update-automatic)
3. [Manual Update (Local File)](#manual-update-local-file)
4. [Platform Setup](#platform-setup)
5. [Recovery](#recovery)

---

## Overview

The thermal viewer includes browser-based firmware updates using WebUSB and DFU (Device Firmware Update) protocol. No external tools required!

### Features

- Automatic update checking on device connect
- One-click firmware download and flash
- Progress tracking with real-time status
- Manual fallback for offline updates
- SHA-256 verification

### Requirements

| Browser | Support |
|---------|---------|
| Chrome 89+ | Supported |
| Edge 89+ | Supported |
| Firefox | Not supported (no WebUSB) |
| Safari | Not supported (no WebUSB) |

---

## Quick Update (Automatic)

### Step 1: Connect Device

1. Click **Connect** button
2. Select your device's serial port
3. App automatically checks for updates

### Step 2: Check for Updates

If an update is available:
- **Update Firmware** button appears in header with badge
- Click to open update dialog

### Step 3: Update Firmware

1. Review version information in dialog
2. Click **Update Firmware**
3. Confirm the warning dialog
4. Wait ~90 seconds for update to complete

### Step 4: Reconnect

1. Device automatically reboots to new firmware
2. Click **Reconnect** when prompted

---

## Manual Update (Local File)

Use this when:
- No network access
- Installing custom firmware

### Step 1: Get Firmware File

Download `.hex` file from:
- GitLab Releases page
- Local build output

### Step 2: Open Update Dialog

Click **Update Firmware** button in header.

### Step 3: Select File

1. Scroll to "Manual Firmware Upload" section
2. Click **Choose Firmware File...**
3. Select your `.hex` file
4. File size is validated

### Step 4: Flash

1. Click **Update Firmware**
2. Confirm warning dialog
3. Wait ~90 seconds for update

---

## Platform Setup

### macOS

**Works out of box** - no driver installation needed.

---

### Windows

**Requires Zadig driver** (one-time setup):

1. Download [Zadig](https://zadig.akeo.ie/)

2. Put device in DFU mode:
   - Disconnect USB
   - Press and **HOLD** BOOT button on board
   - Connect USB while holding BOOT
   - Release BOOT button

3. Run Zadig:
   - Options → List All Devices
   - Select "STM32 BOOTLOADER"
   - Driver: WinUSB (v6.x.x)
   - Click "Replace Driver"

4. Device is ready for WebUSB updates

---

### Linux

**Requires udev rules**:

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

---

## Recovery

### Device Won't Boot After Update

**Don't panic!** STM32 has an unbrickable ROM bootloader.

### Recovery Steps

1. **Enter manual DFU mode:**
   - Disconnect USB
   - Press and HOLD BOOT button
   - Connect USB while holding BOOT
   - Release BOOT button

2. **Retry from web interface:**
   - Open thermal viewer
   - Click Update Firmware
   - Select working firmware file
   - Flash

3. **If web update fails, use command-line:**

   **STM32CubeProgrammer** (Recommended):
   - Supports `.hex` files natively
   - Download from ST website

   **dfu-util** (Advanced):

   > **Warning:** dfu-util treats files as raw binary. Do NOT flash `.hex` files directly - they must be converted first.

   ```bash
   # Only for .bin files:
   dfu-util -a 0 -s 0x08000000:leave -D melexis_io_fw.bin
   ```

---

## Update Flow (Technical)

For reference, the complete update flow:

```
1. Check Version      → Query :PeopleDetection:VERSION? via Serial
2. Fetch Latest       → GitLab API: GET /releases
3. Download HEX       → Download melexis_io_fw.hex
4. Verify Checksum    → Validate download integrity
5. Enter DFU Mode     → Send :SYSTem:DFU 42 command
6. Connect USB        → WebUSB: 0483:df11 (STM32 BOOTLOADER)
7. Erase + Flash      → DfuSe protocol: 2KB blocks @ 0x08000000
8. Verify             → Readback verification
9. Reboot             → Device exits DFU, starts application
```

---

## File Formats

| Format | Description | Usage |
|--------|-------------|-------|
| **.hex** | Intel HEX (text) | Web tool, preserves memory layout |
| **.bin** | Raw binary | Command-line tools only |
| **.dfu** | DfuSe container | STM32-specific metadata |

**Recommendation:** Always use `.hex` files with the web tool.

---

*For developer information about DFU protocol implementation, see the source files in `web/js/`.*
