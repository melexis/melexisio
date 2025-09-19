# Android USB CDC Prototype

This directory contains a minimal native Android implementation for devices without Web Serial support. It offers a basic USB CDC (ACM) terminal analogous to the web version's serial terminal.

## Contents
- `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`: Gradle + Kotlin setup.
- `app/src/main/AndroidManifest.xml`: USB host feature, device attach intent filter, activity.
- `app/src/main/res/xml/usb_filter.xml`: Example VID/PID (Arduino Uno) — adjust/add entries for your hardware.
 - `app/src/main/res/xml/usb_filter.xml`: Device filter for auto-launch. Pre-populated with common USB CDC/serial VID/PIDs (Arduino, FTDI, CP210x, CH34x/CH9102, PL2303). Trim this list to only what you need.
- `app/src/main/java/com/melexisio/terminal/UsbCdcManager.kt`: Helper (enumerate devices, request permission, open, set line coding 115200 8N1, bulk read/write, callbacks).
- `app/src/main/java/com/melexisio/terminal/MainActivity.kt`: Simple UI (device list, status, log, send text).
- `app/src/main/res/layout/activity_main.xml`: Layout with status, devices, log, input.

## Build & Run (Android Studio)
1. Open repository root in Android Studio (detects `android/` project).
2. Sync Gradle; build the `app` module.
3. Connect an Android device with USB host capability (OTG if needed).
4. Run the app. Tap Refresh to list USB CDC devices, tap one, grant permission, then send text.

## Notes & Limitations
- Basic CDC ACM only; no vendor-specific extensions beyond standard control transfers.
- Flow control (RTS/CTS) not currently handled beyond initial control line set (DTR/RTS asserted). Extend with additional controlTransfer calls if required.
- Line coding hardcoded to 115200 8N1; expose UI to change baud/parity/stop bits/data bits for flexibility.
- No history, settings persistence, or IR/People Detection features yet (transport proof-of-concept).
- To reach feature parity, abstract a common transport API and implement higher-level features (history, overlays) either natively (Compose) or via a WebView + JS bridge.

## Security & Permissions
- Android permission prompt appears per device; once granted, session persists until unplug.
- Add additional `usb-device` entries in `usb_filter.xml` for auto-launch scenarios.

### USB device filter notes
- File: `app/src/main/res/xml/usb_filter.xml`
- Purpose: When a matching device is attached, Android can present your app as a handler and route the attach intent.
- Keep it narrow: Only keep VID/PID pairs for devices you actually target. A broad list can steal devices from other apps or confuse users.
- Included examples (from `usb_filter.xml`):
	- Arduino LLC: `2341:0043` (Uno R3), `2341:0001` (older Uno)
	- FTDI: `0403:6001` (FT232R)
	- Silicon Labs: `10C4:EA60` (CP210x)
	- WCH: `1A86:7523`, `1A86:5523` (CH340/CH341), `1A86:55D4` (CH9102)
	- Prolific: `067B:2303` (PL2303)
	- STMicroelectronics (VCP): `0483:5740`, `0483:3754`
	- Melexis: `03E9:0041` (Melexis.IO USB CDC), `03E9:A100` (PTC‑05 USB CDC)
- Add/Remove: Edit the XML to add `<usb-device vendor-id="0xVVVV" product-id="0xPPPP" />` lines. Values are hex.
- Testing: Plug/unplug your device; if multiple apps match, Android shows a chooser. If none match, use the app's Refresh button to enumerate and request permission manually.

## Future Tasks
- UI for serial parameters (invoke updated `setLineCoding`).
- Scrollback with coloration matching web version (spans / DiffUtil list).
- Log export (share intent / file save).
- BLE UART transport alternative.
- Compose-based UI refactor.

## Extending
Integrate a shared protocol layer: define message framing & parsing (if needed) then unify logic between web and Android. For BLE, map Nordic UART RX/TX characteristics to the same abstraction.

---

Licensed under the same terms as the root project (see repository license if present).
