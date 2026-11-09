# Melexis IO Tools

Browser utilities for the Melexis.IO device and the chips it talks to — no install, no build
step, no drivers. Everything runs client-side from a static page.

**Live: https://www.melexis.io**

| Tool | Page | Uses |
|---|---|---|
| SCPI Terminal | [tools/terminal.html](tools/terminal.html) | Web Serial |
| WiFi | [tools/wifi.html](tools/wifi.html) | Web Serial / BLE → SCPI |
| I2C Debug | [tools/i2cdebug.html](tools/i2cdebug.html) | Web Serial / BLE → I2C |
| STM32 DFU Tool | [tools/dfuupdate.html](tools/dfuupdate.html) | WebUSB |
| ESP32 ESP Tool | [tools/espupdate.html](tools/espupdate.html) | Web Serial |
| Pressure | [pressure/](pressure/) | Web Serial → I2C/SPI |
| Infrared | [fir/](fir/) | Web Serial → I2C |

## Requirements

- A Chromium-based browser — Chrome, Edge or Opera. Firefox and Safari implement neither
  Web Serial nor WebUSB.
- A secure context: `https://` or `http://localhost`. The hosted site qualifies.

## SCPI Terminal

A serial console for SCPI command sets over USB CDC.

- Port settings: 300–921600 baud, 7/8 data bits, 1/2 stop bits, parity, hardware flow control.
  Baud rate is ignored by CDC devices but is sent anyway for real UART bridges.
- ASCII, HEX or both display modes, optional timestamps, local echo, auto-scroll.
- Command history across sessions (stored in the browser), browsable with Up/Down.
- Autocomplete and per-command help, both discovered from the device on connect.
- Log export with timestamps and direction labels.

### Line endings

Pick **LF**. The `melexis_io` and `evb-gen3` parsers strip only the trailing `\n`, so CR+LF leaves
a stray `\r` glued to the last argument and the command is rejected; CR alone never terminates a
line at all. `mip-firmware` accepts LF, CR and `;`, but LF is the only choice that works
everywhere.

### Supported firmware

| | `melexis_io_fw` | `evb-gen3-fw` | `mip-firmware` |
|---|---|---|---|
| command catalog | `:SYST:HELP:LIST` | `:SYST:HELP:LIST` | `:FILE:CAT 0:/commands.txt` |
| line terminators | LF | LF | LF, CR or `;` |
| prompt | `\n(OK)>` | `\n(OK)>` | `\n(OK)>\n` |

The terminal probes for each catalog source in turn and falls through to `:SYST:HELP`, which all
three implement, so connecting works without telling it which board is attached.

The full protocol contract — framing, prompt parsing, probe order, per-firmware divergences — is
in [.claude/skills/melexis-scpi/SKILL.md](.claude/skills/melexis-scpi/SKILL.md).

## STM32 DFU Tool

Flashes ST DfuSe `.dfu` images over WebUSB, talking to STM DFU bootloaders directly. Parses DfuSe
targets and elements, reads DFU functional descriptors, recovers STM memory maps from USB string
descriptors, and supports a manual memory-map override for bootloaders that expose none.

Connect tries to put the board into DFU mode by itself: the Terminal page cannot hand over its
open port, but ports already granted to this origin are visible here, so one is opened briefly to
send `:SYSTem:DFU 42` before the device picker appears. It is best effort — a busy port or a
device that rejects the command just falls through to selecting the device by hand.

For a board that is connected but should not be flashed, **Disconnect** releases the interface and
leaves it in DFU mode, and **Run Application** performs the DfuSe leave sequence at the application
base so the firmware starts.

## I2C Debug

`tools/i2cdebug.html` is for the case where a sensor simply does not answer. It scans every
address three ways — a plain read, a 16-bit register read and a one-byte SMBus command — because
a part that refuses one shape may answer another, and a scan that only tries one walks past a
working sensor. It can hold SCL or SDA at a level so someone can measure at the chip's own pins,
and it can repeat one transaction indefinitely to give a scope or logic analyser a stable
trigger, which is how you see whether the slave acknowledges on the ninth clock. There is also a
raw SCPI box for everything else.

## Pressure

`pressure/index.html` lists the sensors and `pressure/mlx90835.html` is the readout: an MLX90835
over I2C or SPI through the Melexis IO board, with a live chart and CSV export. Its own help and
licence live beside it in `pressure/` and are fetched at runtime for its Help modal.

## Infrared

Index for the Melexis infrared sensors — MLX90632, MLX90640, MLX90641 and MLX90642 — each read
over I2C through the Melexis IO board. All four are built.

`fir/detect.html` scans the bus before you pick a page: it probes every 7-bit address with a
one-byte read, then identifies what answered from the same registers the vendor libraries use —
the DSP version for the 90632, the device-select bit that separates the 90640 from the 90641 at
their shared 0x33, and the chip ID for the 90642. Every result shows the register values behind
it, and a chip that was re-addressed is still recognised because each answering address is tested
against all four signatures.

The 90642 computes temperatures on the chip, so the page has no calibration maths to run: it reads
768 pixel values plus the ambient word in one I2C transaction and paints them. Its configuration is
shown but not written — refresh rate, emissivity and output format go through a command shape that
the datasheet documents and the driver library does not. The protocol contract for all
four, and the traps in porting their calibration maths, are in
[.claude/skills/melexis-infrared/SKILL.md](.claude/skills/melexis-infrared/SKILL.md).

## Triaxis

`triaxis/mlx90396/` is a copy of [MLX90396-WebUI](https://github.com/wirtyfromtheunknownW/MLX90396-WebUI),
taken unchanged: a joystick visualiser, an NVRAM register editor and an SCPI terminal, driving
the part over SPI through a bridge. It is self-contained and shares nothing with the rest of the
suite. `triaxis/mlx90396-voxdale/` is the demo build of the same application, copied the same
way; the two share `mlx_api.js`, `webdesign.css` and `arduino_api.js` byte for byte and differ
in the interface, the controller and the demo script.

`triaxis/mlx90396-2.html` reads the four magnetic pixels, the differential channels, the supply
and the temperature from an MLX90396 over **SPI** — the MS_A0_A1 pin below an eighth of the
supply straps the part as an SPI slave. Each command is one CS-low full-duplex transfer with a
CRC-8, and at most six magnetic channels come back per measurement.

It is built from the preliminary datasheet V0.5 and from a colleague's working implementation,
which disagree in three places: temperature leads the channel words rather than trailing them,
measurement words are 12-bit rather than 16, and the temperature bit of the read command is
0x41 rather than the 0x48 the datasheet's table implies. The page follows the working code and
offers the datasheet's variant as a switch. Readings stay in raw LSB, since microtesla needs
the configured range.

## Running locally

```bash
python3 -m http.server 3000 --bind 127.0.0.1
```

Then open http://localhost:3000. Any static file server works; `localhost` is a secure context, so
both Web Serial and WebUSB are available.

## Installing as an app

The suite is a PWA. Chrome offers an install button on the frontpage, or use *Install page as app*
from the browser menu.

`service-worker.js` stays at the root rather than moving into `js/`: a worker can never claim
a scope broader than its own directory, so from `js/` it could only control `/js/`.

The service worker is deliberately **network-first**: a cache-first worker keeps serving stale
pages during development, so the cache here is only an offline fallback. If that is ever reversed,
`CACHE` in [service-worker.js](service-worker.js) has to be versioned per deploy.

## Layout

```
index.html            frontpage and install prompt
isp/                  MLX9064x Thermal Viewer, copied unchanged from melexis.io
tools/
  terminal.html         SCPI terminal markup
  dfuupdate.html        DFU updater, self-contained
  i2cdebug.html         I2C bench debugger — scan, line control, scope stimulus
  webusb-probe.html     WebUSB reachability probe, for phones without Web Serial
css/
  style.css             terminal and frontpage styles
  theme.css             shared Bootstrap theme
js/
  app.js                terminal logic — serial I/O, rendering, probes
pressure/             pressure sensors
  index.html            sensor index
  mlx90835.html         MLX90835 readout, Bootstrap-based
  README.md             help text, shown in its Help modal
  LICENSE               licence, shown in its Help modal
triaxis/              magnetic position sensors
  index.html            sensor index
  mlx90396/             MLX90396 Web UI, copied unchanged from a colleague's repo
  mlx90396-voxdale/     the SFI demo build of the same Web UI, also unchanged
  mlx90396-2.html       MLX90396 readout built here
fir/                  far infrared sensors
  index.html            sensor index
  detect.html           I2C bus scan and chip identification
  mlx90614.html         MLX90614 thermometer readout over SMBus
  mlx90632.html         MLX90632 thermometer readout
  mlx90640.html         MLX90640 thermal camera readout
  mlx90641.html         MLX90641 thermal array readout
  mlx90642.html         MLX90642 thermal array readout
favicon.svg           shared icon
manifest.webmanifest  PWA manifest
service-worker.js     offline shell
```

Deployed straight from `master` by GitHub Pages.
