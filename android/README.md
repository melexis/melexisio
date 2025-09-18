# Android USB CDC Prototype

This directory contains a minimal native Android implementation for devices without Web Serial support. It offers a basic USB CDC (ACM) terminal analogous to the web version's serial terminal.

## Contents
- `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`: Gradle + Kotlin setup.
- `app/src/main/AndroidManifest.xml`: USB host feature, device attach intent filter, activity.
- `app/src/main/res/xml/usb_filter.xml`: Example VID/PID (Arduino Uno) — adjust/add entries for your hardware.
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
