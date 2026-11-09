/* Shared serial plumbing for the suite: who owns the board, and how to let go of
 * it without resetting it.
 *
 * ---- One board, many tabs ----
 *
 * Every page here reconnects to an already authorised board on load. Open two of
 * them and the second open takes the port from the first, which is then told
 * "The device has been lost" on its next read — an error that reads like a
 * hardware fault and is not one. What follows is worse: the page blames the
 * wiring, and the search goes to the sensor.
 *
 * So tabs tell each other. A page holding the port answers when another asks,
 * and a page reconnecting by itself stands down instead of taking it. Standing
 * down is the only option either way: measured in Chrome, a second open fails
 * with "Failed to open serial port" rather than taking the board, so the other
 * tab has to let go first. reason() turns that bare failure into what to do
 * about it.
 *
 * The terminal and the sensor pages share the channel, so it does not matter
 * which of them holds the board.
 */
(function () {
  "use strict";

  const CHANNEL = "melexisio.port-claim";
  // Long enough for a holder to answer, short enough not to delay a real connect.
  const REPLY_WAIT_MS = 150;

  function inertClaim() {
    return {
      announce() {},
      release() {},
      heldElsewhere() { return Promise.resolve(false); },
      reason(error) { return Promise.resolve(messageOf(error)); },
    };
  }

  function messageOf(error) {
    return error && error.message ? error.message : String(error);
  }

  /* Which port a tab holds, said as its place in getPorts(). With one board that
     is always 0 and the distinction costs nothing; with several it is what keeps
     a tab using one board from blocking a tab using another. -1 means the holder
     could not work out its own index, which counts as a conflict with anyone. */
  async function indexOfPort(port) {
    try {
      return (await navigator.serial.getPorts()).indexOf(port);
    } catch {
      return -1;
    }
  }

  function sharedClaim() {
    const channel = new BroadcastChannel(CHANNEL);
    let holding = null;          // the index held here, or null when holding nothing

    const conflicts = (mine, theirs) => mine === -1 || theirs === -1 || mine === theirs;

    channel.addEventListener("message", (event) => {
      // Somebody asking whether a port is taken; only its holder answers.
      const data = event.data;
      if (data && data.type === "who-holds" && holding !== null && conflicts(data.index, holding)) {
        channel.postMessage({ type: "holding", index: holding });
      }
    });

    // A tab that goes away without disconnecting still frees the board.
    window.addEventListener("pagehide", () => {
      if (holding === null) return;
      holding = null;
      channel.postMessage({ type: "released" });
    });

    const claim = {
      announce(index) {
        holding = Number.isInteger(index) ? index : -1;
        channel.postMessage({ type: "holding", index: holding });
      },

      release() {
        holding = null;
        channel.postMessage({ type: "released" });
      },

      /* A refused open says nothing about why, and a lost device says something
         that is not true. Both have an answer the reader can act on. */
      async reason(error) {
        const message = messageOf(error);
        /* Chrome's handle to a board can go bad on its own — after a tab fight,
           or a run of quick open/close cycles. The OS still lists the device and
           it still answers from a shell; only the browser cannot reach it, and
           only a replug clears that. */
        if (/device has been lost|network ?error/i.test(message)) {
          return "the browser has lost its handle to this board — unplug the USB cable "
            + "and plug it back in; the board itself is fine";
        }
        if (!/failed to open|access denied|busy|in use/i.test(message)) return message;
        return (await claim.heldElsewhere())
          ? "another tab has this board open — disconnect there first"
          : message;
      },

      heldElsewhere(index) {
        const wanted = Number.isInteger(index) ? index : -1;
        return new Promise((resolve) => {
          let answered = false;
          const onReply = (event) => {
            const data = event.data;
            if (!data || data.type !== "holding" || !conflicts(wanted, data.index)) return;
            answered = true;
            channel.removeEventListener("message", onReply);
            resolve(true);
          };
          channel.addEventListener("message", onReply);
          channel.postMessage({ type: "who-holds", index: wanted });
          setTimeout(() => {
            channel.removeEventListener("message", onReply);
            if (!answered) resolve(false);
          }, REPLY_WAIT_MS);
        });
      },
    };

    return claim;
  }

  /* ---- Letting go of the board ----
   *
   * The Melexis IO board reads DTR as "something is attached": asserted turns
   * its LED green, released turns it red, and nothing else about its behaviour
   * changes. RTS it ignores, and its USB CDC accepts any line coding. So here
   * this is what makes the LED go red when a page disconnects, instead of
   * leaving it green until the browser gets round to dropping the line.
   *
   * The order matters elsewhere. On a devkit where DTR and RTS drive EN and
   * GPIO0 through the auto-reset transistors, RTS asserted while DTR is
   * released holds EN low, so dropping DTR on its own resets the part.
   * MIPTerminal learned that the expensive way (mip/mip.py) and drops RTS
   * first; a browser drops both at close in an order of its own, so the pages
   * settle it themselves beforehand.
   *
   * What a browser cannot do is open with the lines already down, which is how
   * MIPTerminal opens an ESP32 (CubeProgrammer/worker.py) so that the open
   * itself does not reset the board. Measured here on an ESP32-S3, a C3 and a
   * C6 — all of them 303a:1001, which is why the vendor alone identifies them —
   * and an ordinary open leaves every one running: the USB device number does
   * not change, because the reset needs a sequence on those lines rather than a
   * raised level. A devkit with a bridge and auto-reset
   * transistors is the case where an open does reset the part, and there a
   * page has no lever at all.
   */
  async function lowerSignals(port) {
    if (!port || typeof port.setSignals !== "function") return;

    /* Not on an ESP32 with native USB. Its USB Serial/JTAG peripheral drives the
       chip's reset logic from these two lines — the register the firmware reads
       DTR from is called chip_rst, and esptool enters the downloader by toggling
       them — so touching them restarts the board, the USB device enumerates
       again and the page is left holding a port that reports the device as lost.
       The console needs neither line. Found in the firmware's own web console,
       which leaves them alone for exactly this reason. */
    if (deviceId(port)?.startsWith(ESPRESSIF_VENDOR)) return;
    try {
      await port.setSignals({ requestToSend: false });
      await port.setSignals({ dataTerminalReady: false });
    } catch {
      /* Not every platform allows it, and a port already gone refuses; the
         close that follows is what actually matters. */
    }
  }

  /* Which device is this, in words. Chrome's picker lists every USB CDC port on
     the machine, and an ST-Link exposes one that looks just like the board; a
     page that names what it opened turns a silent session into an obvious
     mis-pick. */
  const KNOWN = {
    "03e9:0041": "Melexis IO",
    "0483:374e": "ST-Link virtual port",
    "10c4:ea60": "ESP32 devkit (CP210x bridge)",
    "1a86:7523": "ESP32 devkit (CH340 bridge)",
    "1a86:55d4": "ESP32 devkit (CH343 bridge)",
    /* An ESP32 board whose firmware presents its own CDC rather than the chip's
       USB Serial/JTAG. It is still an ESP32, but the host can rarely reset it
       into the downloader, so its buttons are usually the way in. */
    "239a:8143": "ESP32 running CircuitPython",
  };

  /* Espressif's own USB Serial/JTAG answers for any product id under 0x303a,
     which is how MIPTerminal recognises it too (gui/AppUpdateDialog.py). */
  const ESPRESSIF_VENDOR = "303a";

  function describe(port) {
    const info = port && typeof port.getInfo === "function" ? port.getInfo() : {};
    if (!Number.isInteger(info.usbVendorId)) return "serial device";
    const vendor = info.usbVendorId.toString(16).padStart(4, "0");
    const id = `${vendor}:${(info.usbProductId ?? 0).toString(16).padStart(4, "0")}`;
    if (KNOWN[id]) return `${KNOWN[id]} (${id})`;
    if (vendor === ESPRESSIF_VENDOR) return `ESP32 USB Serial/JTAG (${id})`;
    return id;
  }

  /* ---- How to open the port ----
   *
   * Detect is where a session starts and where the line is chosen, so it hands
   * the choice on: the chip pages take it from the link, fall back to whatever
   * was last used, and only then to the CDC default. It matters solely on the
   * ST-Link path, where the settings reach a real UART — but that is exactly
   * the path where a page opening 115200 8N1 of its own accord hears nothing.
   */
  function deviceId(port) {
    const info = port && typeof port.getInfo === "function" ? port.getInfo() : {};
    if (!Number.isInteger(info.usbVendorId)) return null;
    return `${info.usbVendorId.toString(16).padStart(4, "0")}:${(info.usbProductId ?? 0).toString(16).padStart(4, "0")}`;
  }

  const LINE_KEY = "melexisio.line";
  /* 115200 8N1 suits everything this suite meets — an ESP32 wants exactly that,
     and the board's CDC ignores line coding altogether — with one exception:
     an ST-Link bridges to a UART running 7O2. So the device decides, and the
     table only has to carry what differs. */
  const DEFAULT_LINE = "115200,8,none,1";
  const LINE_BY_DEVICE = {
    "0483:374e": { line: "115200,7,odd,2", why: "an ST-Link's UART needs 7O2" },
  };

  function parseLine(value) {
    const [baud, bits, parity, stop] = String(value ?? "").split(",");
    const options = {
      baudRate: parseInt(baud, 10),
      dataBits: parseInt(bits, 10),
      parity,
      stopBits: parseInt(stop, 10),
    };
    const sane = Number.isInteger(options.baudRate)
      && [7, 8].includes(options.dataBits)
      && ["none", "odd", "even"].includes(options.parity)
      && [1, 2].includes(options.stopBits);
    return sane ? options : null;
  }

  /* Remembered per device. One key for all of them meant a session with an
     ST-Link left 7O2 behind, and the next board — which wants 8N1 and says so
     through its vid:pid — was opened with it. */
  const lineKeyFor = (port) => `${LINE_KEY}.${deviceId(port) ?? "unknown"}`;

  function rememberLine(value, port) {
    try { localStorage.setItem(lineKeyFor(port), value); } catch { /* storage unavailable */ }
  }


  // What this device needs, when it needs anything in particular.
  const lineFor = (port) => LINE_BY_DEVICE[deviceId(port)] ?? null;

  /* A page asks for a link's settings first, then what the device itself needs,
     then what was last used, and only then the default. */
  function lineOptions(port) {
    const handedOver = new URLSearchParams(location.hash.replace(/^#/, "")).get("line");
    let remembered = null;
    try { remembered = localStorage.getItem(lineKeyFor(port)); } catch { /* storage unavailable */ }
    return parseLine(handedOver)
      ?? parseLine(lineFor(port)?.line)
      ?? parseLine(remembered)
      ?? parseLine(DEFAULT_LINE);
  }

  const describeLine = (options) =>
    `${options.baudRate} ${options.dataBits}${options.parity[0].toUpperCase()}${options.stopBits}`;

  /* ---- The same board, over Bluetooth ----
   *
   * The firmware on an ESP32 answers the same SCPI over BLE that it answers
   * over USB, on the Nordic UART Service, so a page only needs somewhere else
   * to put its bytes. This hands back the same shape the serial side uses: a
   * write and a close.
   *
   * Two things cost time when this was first written, in the firmware's own
   * console (html/terminal.html there): the service UUID travels in the scan
   * response rather than the advertisement, because a 128-bit UUID and a name
   * together do not fit in 31 bytes, so the filter is on the name and the
   * service is asked for separately; and a pairing made before the firmware was
   * reflashed breaks discovery until the operating system forgets the device.
   */
  const NUS = {
    service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    rx: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
    tx: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
  };
  /* melexis-XXXXXX for the sensor firmware; esp32-clock-XXXXXX for the clock,
     which carries the same console under its own name. The filters are OR'ed. */
  const BLE_NAME_PREFIXES = ["melexis-", "esp32-clock-"];
  // What the ATT default of 23 leaves. The firmware negotiates 517, which Web
  // Bluetooth does not expose, so this stays at the size that always fits.
  const BLE_CHUNK = 20;

  async function connectBluetooth({ onData, onDisconnect } = {}) {
    if (!("bluetooth" in navigator)) {
      throw new Error("Web Bluetooth is unavailable. Use Chrome or Edge over https:// or http://localhost.");
    }

    const device = await navigator.bluetooth.requestDevice({
      filters: BLE_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
      optionalServices: [NUS.service],
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(NUS.service);
    const rx = await service.getCharacteristic(NUS.rx);
    const tx = await service.getCharacteristic(NUS.tx);

    tx.addEventListener("characteristicvaluechanged", (event) => {
      if (onData) onData(new Uint8Array(event.target.value.buffer));
    });
    await tx.startNotifications();

    let open = true;
    device.addEventListener("gattserverdisconnected", () => {
      if (!open) return;                 // a close from this side reports itself
      open = false;
      if (onDisconnect) onDisconnect();
    });

    return {
      kind: "ble",
      name: device.name,
      async write(bytes) {
        for (let at = 0; at < bytes.length; at += BLE_CHUNK) {
          await rx.writeValueWithoutResponse(bytes.slice(at, at + BLE_CHUNK));
        }
      },
      close() {
        open = false;
        try { device.gatt.disconnect(); } catch { /* already gone */ }
      },
    };
  }

  /* ---- The same board, over its own network ----
   *
   * A board with an address can serve these pages itself, and a page served by
   * the board can talk back to it over a WebSocket. This exists so that it can:
   * it hands back the same shape as the serial and Bluetooth sides, a write and
   * a close, so a page gains a third way to reach a board without knowing a
   * third set of rules.
   *
   * Why it has to be the board that serves the page: a page on https:// may not
   * open ws:// or http:// to a private address. That is mixed content, which the
   * browser refuses outright — no warning to dismiss, no flag — and Chrome asks
   * separately before a public page may touch the local network at all. Served
   * from the board, everything is one origin and none of it applies, which is
   * why the default URL below is built from the page's own location rather than
   * from an address somebody types.
   *
   * The console is line-based ASCII, so this sends text frames: a firmware
   * handler then reads the payload as a string rather than reassembling bytes.
   * Replies are accepted either way, because a server that answers in binary is
   * answering correctly too.
   */
  const WS_OPEN_TIMEOUT = 5000;

  function webSocketUrl(path = "/ws") {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${location.host}${path}`;
  }

  async function connectWebSocket({ url, onData, onDisconnect, binary = false } = {}) {
    if (typeof WebSocket !== "function") throw new Error("This browser has no WebSocket.");

    const target = url || webSocketUrl();
    if (location.protocol === "https:" && target.startsWith("ws:")) {
      throw new Error(
        "A page served over https:// cannot open a plain ws:// socket. Open the page from the board itself.");
    }

    const socket = new WebSocket(target);
    socket.binaryType = "arraybuffer";

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try { socket.close(); } catch { /* never opened */ }
        reject(new Error(`No answer from ${target} within ${WS_OPEN_TIMEOUT} ms.`));
      }, WS_OPEN_TIMEOUT);

      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      /* An error event carries no reason by design — the browser withholds it so
         a page cannot scan a network by watching failures. */
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error(`Could not open ${target}. The board may be off the network, or serving nothing there.`));
      }, { once: true });
    });

    socket.addEventListener("message", (event) => {
      if (!onData) return;
      const data = event.data;
      if (typeof data === "string") onData(encoder.encode(data));
      else if (data instanceof ArrayBuffer) onData(new Uint8Array(data));
      else if (data instanceof Blob) data.arrayBuffer().then((buffer) => onData(new Uint8Array(buffer)));
    });

    let open = true;
    socket.addEventListener("close", () => {
      if (!open) return;                 // a close from this side reports itself
      open = false;
      if (onDisconnect) onDisconnect();
    });

    return {
      kind: "ws",
      name: new URL(target).host,
      async write(bytes) {
        socket.send(binary ? bytes : decoder.decode(bytes));
      },
      close() {
        open = false;
        try { socket.close(); } catch { /* already gone */ }
      },
    };
  }

  /* Whether this page came from a board rather than from the tool site. A page
     served from the board should reach it over the network it is already on,
     and offering a port picker there would be asking for the cable back. */
  function servedByBoard() {
    return location.protocol.startsWith("http")
      && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
      && !/github\.io$|^melexis\.io$|\.melexis\.io$/.test(location.hostname);
  }

  /* Discovery fails in a way that names neither cause; this is the one that is
     usually true and can be acted on. */
  function bluetoothHint(error) {
    const message = error && error.message ? error.message : String(error);
    return /discover|disconnect|GATT/i.test(message)
      ? "A pairing made before the firmware was reflashed does this. Remove the device in the operating system, then connect again."
      : null;
  }

  window.melexisSerial = {
    describe,
    connectBluetooth,
    bluetoothHint,
    connectWebSocket,
    webSocketUrl,
    servedByBoard,
    indexOfPort,
    lineFor,
    lineOptions,
    rememberLine,
    describeLine,
    claim: typeof BroadcastChannel === "function" ? sharedClaim() : inertClaim(),
    lowerSignals,
  };
})();
