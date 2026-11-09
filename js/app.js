/* ============================================================
   USB CDC Terminal — Application Logic
   Web Serial API communication with USB CDC devices
   ============================================================ */

(() => {
  'use strict';

  // ---- State ----
  const state = {
    port: null,
    link: null,                    // how to write and how to hang up, per transport
    reader: null,
    readLoop: null,
    isConnected: false,
    isReading: false,
    txBytes: 0,
    rxBytes: 0,
    logEntries: [],
    commandHistory: [],
    historyIndex: null,
    draftCommand: '',
    renderState: {
      rx: createRenderState(),
      tx: createRenderState(),
    },
    commandCatalog: [],
    commandHelpRaw: '',
    commandHelpIndex: {},
    activeProbe: createProbeState(),
  };

  const COMMAND_HISTORY_KEY = 'usb-cdc-terminal.command-history';
  const COMMAND_HISTORY_LIMIT = 100;
  const AUTOCOMPLETE_PROBE_COMMAND = ':syst:help:list\n';
  // mip-firmware has no :SYST:HELP:LIST, but command_index_build() writes the
  // same uppercase permutation list to the RAM volume at boot (parser.c:139).
  const AUTOCOMPLETE_FILE_PROBE_COMMAND = ':FILE:CAT 0:/commands.txt\n';
  const COMMAND_HELP_PROBE_COMMAND = ':syst:help\n';
  const AUTOCOMPLETE_PROBE_TIMEOUT_MS = 3000;
  const TERMINAL_LINE_LIMIT = 5000;
  const LOG_ENTRY_LIMIT = 10000;

  // ---- DOM Elements ----
  const $ = (id) => document.getElementById(id);

  const els = {
    // Connection
    btnConnect:          $('btnConnect'),
    btnConnectBle:       $('btnConnectBle'),
    baudRate:            $('baudRate'),
    dataBits:            $('dataBits'),
    stopBits:            $('stopBits'),
    parity:              $('parity'),
    flowControl:         $('flowControl'),
    lineMode:            $('lineMode'),

    // Layout
    sidebar:             $('sidebar'),
    sidebarBackdrop:     $('sidebarBackdrop'),
    btnMenu:             $('btnMenu'),

    // Status
    connectionIndicator: $('connectionIndicator'),
    connectionLabel:     $('connectionLabel'),

    // Display
    displayMode:         $('displayMode'),
    autoScroll:          $('autoScroll'),
    showTimestamps:      $('showTimestamps'),
    localEcho:           $('localEcho'),

    // Terminal
    terminal:            $('terminal'),
    terminalWelcome:     $('terminalWelcome'),
    terminalOutput:      $('terminalOutput'),

    // Input
    messageInput:        $('messageInput'),
    commandSuggestions:  $('commandSuggestions'),
    commandHelpText:     $('commandHelpText'),
    commandHelpStatus:   $('commandHelpStatus'),
    lineEnding:          $('lineEnding'),
    btnSend:             $('btnSend'),

    // Actions
    btnClear:            $('btnClear'),
    btnExport:           $('btnExport'),

    // Stats
    txCount:             $('txCount'),
    rxCount:             $('rxCount'),
  };


  // ---- Initialization ----
  function init() {
    loadCommandHistory();
    bindEvents();

    if (!('serial' in navigator)) {
      logSystem('⚠ Web Serial API not detected. This may be because:');
      logSystem('  • The page is not served over a secure context (use localhost or HTTPS)');
      logSystem('  • Your browser does not support it (Chrome 89+, Edge 89+, Opera 76+)');
      logSystem('  • A browser flag may need to be enabled');
      logSystem('Tip: try accessing via http://localhost:3000 or enable chrome://flags/#enable-experimental-web-platform-features');
    } else {
      logSystem('Ready. Click Connect to select a USB CDC device.');
    }
  }


  // ---- Event Binding ----
  function bindEvents() {
    els.btnConnect.addEventListener('click', toggleConnection);
    els.btnConnectBle.addEventListener('click', async () => {
      if (state.isConnected) await disconnect();
      else await connectBluetooth();
    });
    els.btnSend.addEventListener('click', sendMessage);
    els.btnClear.addEventListener('click', clearTerminal);
    els.btnExport.addEventListener('click', exportLog);

    els.btnMenu.addEventListener('click', () => {
      setSidebarOpen(!els.sidebar.classList.contains('open'));
    });

    els.sidebarBackdrop.addEventListener('click', () => setSidebarOpen(false));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
      }
    });

    els.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        handleHistoryNavigation(e);
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    els.messageInput.addEventListener('input', () => {
      if (state.historyIndex === null) {
        state.draftCommand = els.messageInput.value;
      }

      updateSelectedCommandHelp();
    });

    // Port-level events are only available where Web Serial is supported.
    if ('serial' in navigator) {
      navigator.serial.addEventListener('connect', () => {
        logSystem('USB device connected.');
      });

      navigator.serial.addEventListener('disconnect', (e) => {
        if (state.port === e.target) {
          handleDisconnect('Device was physically disconnected.');
        }
      });
    }
  }


  // The sidebar is off-canvas below the 768px breakpoint; without this it is
  // unreachable and the connection controls cannot be opened at all.
  function setSidebarOpen(open) {
    els.sidebar.classList.toggle('open', open);
    els.sidebarBackdrop.classList.toggle('is-visible', open);
    els.btnMenu.setAttribute('aria-expanded', String(open));
  }


  // ============================================================
  //  CONNECTION MANAGEMENT
  // ============================================================

  async function toggleConnection() {
    if (state.isConnected) {
      await disconnect();
    } else {
      await connect();
    }
  }


  /* This page always asks which port to use, but it records which board was
     picked: the sensor pages reopen that one without a dialog of their own. */
  const PORT_KEY = 'melexisio.port';

  function rememberPort(port) {
    const info = port && port.getInfo ? port.getInfo() : {};
    if (!Number.isInteger(info.usbVendorId) || !Number.isInteger(info.usbProductId)) return;
    try {
      window.localStorage.setItem(PORT_KEY, `${info.usbVendorId.toString(16)}:${info.usbProductId.toString(16)}`);
    } catch { /* storage unavailable */ }
  }

  async function connect() {
    try {
      if (!('serial' in navigator)) {
        logError('Web Serial API is not available. Make sure you are using Chrome/Edge/Opera and accessing the page via localhost or HTTPS.');
        return;
      }

      clearCommandCatalog();
      setConnectionState('connecting');

      /* Always ask. The machine offers several CDC ports — the board, an
         ST-Link, whatever else is plugged in — and picking is the one decision
         this page should not make on somebody's behalf. */
      state.port = await navigator.serial.requestPort();

      const options = lineOptions(state.port);
      await state.port.open(options);
      rememberPort(state.port);

      state.link = {
        kind: 'serial',
        async write(bytes) {
          const writer = state.port.writable.getWriter();
          try { await writer.write(bytes); } finally { writer.releaseLock(); }
        },
      };

      claims.announce(await window.melexisSerial?.indexOfPort(state.port));
      setSidebarOpen(false);
      setConnectionState('connected');
      const device = window.melexisSerial?.describe(state.port) ?? 'serial device';
      logSystem(`Connected to ${device} at ${options.baudRate} baud (${options.dataBits}${options.parity[0].toUpperCase()}${options.stopBits}).`);
      warnAboutLineSettings(device, options);
      watchForSilence();

      // Start reading
      state.readLoop = startReading();
      /* A session that ended mid-command leaves the board still answering it, and
         this one would read that tail as the answer to its own first command. The
         tail runs as long as the previous session left work queued, so wait for the
         line to fall quiet before the probe starts. */
      // Longer than the board's own pause on a read of an address nobody answers.
      for (const until = Date.now() + 6000; Date.now() < until; ) {
        const before = state.rxBytes;
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (state.rxBytes === before) break;
      }
      resetActiveProbe();
      requestCommandCatalog();

    } catch (err) {
      setConnectionState('disconnected');
      if (err.name === 'NotFoundError') {
        logSystem('No device selected.');
      } else {
        logError(`Connection failed: ${err.message}`);
      }
    }
  }

  /* The firmware answers the same SCPI over Bluetooth, on the Nordic UART
     Service, so the terminal above this does not change — only how bytes get in
     and out. Taken from the console in the firmware repository (html/terminal.html),
     which is where this was first made to work.

     The service UUID travels in the scan response rather than the advertisement,
     because a 128-bit UUID and a name together do not fit in 31 bytes; so the
     filter is on the name and the service is asked for separately. */
  const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const NUS_RX      = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
  const NUS_TX      = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
  /* melexis-XXXXXX for the sensor firmware; esp32-clock-XXXXXX for the clock,
     which carries the same console under its own name. The filters are OR'ed. */
  const BLE_NAME_PREFIXES = ['melexis-', 'esp32-clock-'];
  const BLE_CHUNK = 20;          // what the ATT default of 23 leaves for payload

  async function connectBluetooth() {
    if (!('bluetooth' in navigator)) {
      logError('Web Bluetooth is unavailable. Use Chrome or Edge over https:// or http://localhost.');
      return;
    }

    try {
      clearCommandCatalog();
      setConnectionState('connecting');

      const device = await navigator.bluetooth.requestDevice({
        filters: BLE_NAME_PREFIXES.map(namePrefix => ({ namePrefix })),
        optionalServices: [NUS_SERVICE],
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(NUS_SERVICE);
      const rx = await service.getCharacteristic(NUS_RX);
      const tx = await service.getCharacteristic(NUS_TX);

      tx.addEventListener('characteristicvaluechanged', (event) => {
        receive(new Uint8Array(event.target.value.buffer));
      });
      await tx.startNotifications();

      device.addEventListener('gattserverdisconnected', () => {
        if (state.link?.kind === 'ble') handleDisconnect('The board went out of range or switched off.');
      });

      state.link = {
        kind: 'ble',
        async write(bytes) {
          /* A write cannot exceed the negotiated MTU, which Web Bluetooth does
             not expose, and the firmware reassembles — so a long command is cut
             up rather than refused. */
          for (let at = 0; at < bytes.length; at += BLE_CHUNK) {
            await rx.writeValueWithoutResponse(bytes.slice(at, at + BLE_CHUNK));
          }
        },
        close() { device.gatt.disconnect(); },
      };

      setSidebarOpen(false);
      setConnectionState('connected');
      logSystem(`Connected to ${device.name} over Bluetooth.`);
      requestCommandCatalog();
    } catch (err) {
      setConnectionState('disconnected');
      state.link = null;
      if (err.name === 'NotFoundError') {
        logSystem('No device selected.');
        return;
      }
      logError(`Bluetooth connection failed: ${err.message}`);
      if (/discover|disconnect|GATT/i.test(err.message)) {
        logSystem('A pairing made before the firmware was reflashed does this. '
          + 'Remove the device in the operating system and connect again.');
      }
    }
  }

  async function disconnect() {
    state.isReading = false;
    resetActiveProbe();
    clearCommandCatalog();

    // A Bluetooth link has no port to close and no reader to wake.
    if (state.link?.kind === 'ble') {
      /* Dropped first: closing the link fires gattserverdisconnected, and the
         handler would otherwise report a deliberate disconnect as the board
         going out of range. */
      const link = state.link;
      state.link = null;
      try { link.close(); } catch { /* already gone */ }
      resetRenderedLines();
      setConnectionState('disconnected');
      logSystem('Disconnected.');
      return;
    }

    const port = state.port;

    // Cancelling wakes up the pending read(); the read loop itself owns the
    // lock and releases it, so wait for the loop to finish before closing.
    if (state.reader) {
      try {
        await state.reader.cancel();
      } catch {
        // An already-errored stream cannot be cancelled; closing still applies.
      }
    }

    if (state.readLoop) {
      try {
        await state.readLoop;
      } catch {
        // Read failures are reported by the loop itself.
      }
      state.readLoop = null;
    }

    if (port) {
      try {
        await window.melexisSerial?.lowerSignals(port);
        await port.close();
      } catch (err) {
        logError(`Disconnect error: ${err.message}`);
      }
    }

    state.port = null;
    state.reader = null;
    state.link = null;
    claims.release();
    resetRenderedLines();
    setConnectionState('disconnected');
    logSystem('Disconnected.');
  }

  function handleDisconnect(reason) {
    state.isReading = false;
    state.reader = null;
    state.readLoop = null;
    state.port = null;
    state.link = null;
    claims.release();
    resetActiveProbe();
    clearCommandCatalog();
    resetRenderedLines();
    setConnectionState('disconnected');
    logError(reason || 'Connection lost.');
  }

  function setConnectionState(newState) {
    const indicator = els.connectionIndicator;
    const label = els.connectionLabel;
    const btn = els.btnConnect;
    // One board at a time, whichever way it is reached.
    if (els.btnConnectBle) els.btnConnectBle.disabled = newState !== 'disconnected';

    // Remove old classes
    indicator.className = 'status-dot';

    switch (newState) {
      case 'connecting':
        indicator.classList.add('status-dot--connecting');
        label.textContent = 'Connecting…';
        btn.disabled = true;
        state.isConnected = false;
        break;

      case 'connected':
        indicator.classList.add('status-dot--connected');
        label.textContent = 'Connected';
        btn.innerHTML = `
          <svg class="btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
          <span>Disconnect</span>`;
        btn.classList.add('btn--danger');
        btn.disabled = false;
        els.messageInput.disabled = false;
        els.btnSend.disabled = false;
        els.messageInput.focus();
        state.isConnected = true;
        disablePortSettings(true);
        break;

      case 'disconnected':
        indicator.classList.add('status-dot--disconnected');
        label.textContent = 'Disconnected';
        btn.innerHTML = `
          <svg class="btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
          <span>Connect</span>`;
        btn.classList.remove('btn--danger');
        btn.disabled = false;
        els.messageInput.disabled = true;
        els.btnSend.disabled = true;
        state.isConnected = false;
        disablePortSettings(false);
        break;
    }
  }

  function disablePortSettings(disabled) {
    els.baudRate.disabled = disabled;
    els.dataBits.disabled = disabled;
    els.stopBits.disabled = disabled;
    els.parity.disabled = disabled;
    els.flowControl.disabled = disabled;
  }


  // ============================================================
  //  READ / WRITE
  // ============================================================

  /* Bytes arrive from a serial read loop or from a BLE notification, and from
     there on nothing cares which. */
  function receive(bytes) {
    state.rxBytes += bytes.length;
    updateStats();
    if (processProbeChunk(bytes)) return;
    displayData(bytes, 'rx');
  }

  async function startReading() {
    if (!state.port || !state.port.readable) return;
    state.isReading = true;

    while (state.isReading && state.port && state.port.readable) {
      const reader = state.port.readable.getReader();
      state.reader = reader;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value && value.length > 0) receive(value);
        }
      } catch (err) {
        if (state.isReading) {
          logError(`Read error: ${err.message}`);
          /* Chrome reports a port taken over by another page exactly as it
             reports unplugged hardware, and the board is almost never the
             culprit. */
          if (/device has been lost/i.test(err.message)) {
            logSystem('If the board is still plugged in, another tab or program probably took the port.');
          }
        }
      } finally {
        reader.releaseLock();
        if (state.reader === reader) {
          state.reader = null;
        }
      }
    }
  }

  async function sendMessage() {
    if (!state.isConnected || !state.link) return;

    const text = els.messageInput.value;

    // Resolve line ending (the value from <option> is a literal string like "\\r\\n")
    const lineEndingRaw = els.lineEnding.value;
    const lineEnding = lineEndingRaw
      .replace(/\\r/g, '\r')
      .replace(/\\n/g, '\n');

    // A bare line ending is a valid keystroke (e.g. Enter to re-trigger a prompt).
    if (!text && !lineEnding) return;

    try {
      await sendRawText(text + lineEnding);
      addCommandToHistory(text);

      state.historyIndex = null;
      state.draftCommand = '';
      applyInputValue('');
      els.messageInput.focus();

    } catch (err) {
      logError(`Send failed: ${err.message}`);
    }
  }


  // ============================================================
  //  DISPLAY
  // ============================================================

  function displayData(data, direction) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const stream = state.renderState[direction];

    // Bytes are buffered and rendered once per chunk (or per line break);
    // re-rendering on every byte is quadratic and stalls the UI at high baud.
    let pendingRender = false;

    for (const byte of bytes) {
      if (stream.pendingCarriageReturn) {
        stream.pendingCarriageReturn = false;
        if (byte === 0x0A) {
          continue;
        }
      }

      if (byte === 0x0A || byte === 0x0D) {
        finalizeRenderedLine(direction);
        pendingRender = false;

        if (byte === 0x0D) {
          stream.pendingCarriageReturn = true;
        }

        continue;
      }

      ensureRenderedLine(direction);
      stream.bytes.push(byte);
      pendingRender = true;
    }

    if (pendingRender) {
      updateRenderedLine(direction);
    }

    // Log entry
    if (direction === 'rx') {
      addLogEntry('rx', data);
    }

    autoScroll();
  }

  function logSystem(message) {
    const showTs = els.showTimestamps.checked;
    const ts = showTs ? formatTimestamp() : null;

    const line = document.createElement('div');
    line.className = 'term-line term-line--sys';

    if (ts) {
      const tsEl = document.createElement('span');
      tsEl.className = 'term-line__ts';
      tsEl.textContent = ts;
      line.appendChild(tsEl);
    }

    const dirEl = document.createElement('span');
    dirEl.className = 'term-line__dir term-line__dir--sys';
    dirEl.textContent = '●';
    line.appendChild(dirEl);

    const msgEl = document.createElement('span');
    msgEl.className = 'term-line__msg';
    msgEl.textContent = message;
    line.appendChild(msgEl);

    appendTerminalLine(line);
    addLogEntry('sys', message);
    autoScroll();
  }

  function logError(message) {
    const showTs = els.showTimestamps.checked;
    const ts = showTs ? formatTimestamp() : null;

    const line = document.createElement('div');
    line.className = 'term-line term-line--error';

    if (ts) {
      const tsEl = document.createElement('span');
      tsEl.className = 'term-line__ts';
      tsEl.textContent = ts;
      line.appendChild(tsEl);
    }

    const dirEl = document.createElement('span');
    dirEl.className = 'term-line__dir term-line__dir--sys';
    dirEl.textContent = '✖';
    line.appendChild(dirEl);

    const msgEl = document.createElement('span');
    msgEl.className = 'term-line__msg';
    msgEl.textContent = message;
    line.appendChild(msgEl);

    appendTerminalLine(line);
    addLogEntry('err', message);
    autoScroll();
  }


  // ============================================================
  //  UTILITIES
  // ============================================================

  function appendTerminalLine(element) {
    els.terminalWelcome.style.display = 'none';
    els.terminalOutput.classList.add('active');
    els.terminalOutput.appendChild(element);
    trimTerminalOutput();
  }

  // The log array is capped, but the DOM was not: a long session accumulated
  // nodes until the tab ran out of memory.
  function trimTerminalOutput() {
    const output = els.terminalOutput;
    const active = state.renderState;

    while (output.childElementCount > TERMINAL_LINE_LIMIT) {
      const oldest = output.firstElementChild;

      // Never drop a line that is still being written to.
      if (oldest === active.rx.lineEl || oldest === active.rx.hexEl ||
          oldest === active.tx.lineEl || oldest === active.tx.hexEl) {
        break;
      }

      oldest.remove();
    }
  }

  function autoScroll() {
    if (els.autoScroll.checked) {
      els.terminal.scrollTop = els.terminal.scrollHeight;
    }
  }

  function formatTimestamp() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  }

  function toHexString(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    return Array.from(bytes)
      .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
  }

  function updateStats() {
    els.txCount.textContent = formatByteCount(state.txBytes);
    els.rxCount.textContent = formatByteCount(state.rxBytes);
  }

  function formatByteCount(bytes) {
    if (bytes < 1024) return bytes.toString();
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'K';
    return (bytes / 1048576).toFixed(1) + 'M';
  }

  function createProbeState() {
    return {
      active: false,
      kind: null,
      buffer: '',
      decoder: new TextDecoder(),
      optional: false,
      next: null,
      timerId: null,
    };
  }

  async function sendRawText(text, options = {}) {
    if (!state.isConnected || !state.link) {
      throw new Error('Nothing is connected.');
    }

    const {
      echo = els.localEcho.checked,
      logTx = true,
    } = options;

    const encoder = new TextEncoder();
    const data = encoder.encode(text);

    /* Echo before writing, not after. Awaiting the write yields to the event
     * loop and the read loop runs there, so a device that answers immediately
     * gets the first chunk of its reply on screen before the echo — and the
     * command appears inside its own response. What the user typed is known
     * now, and does not depend on the write succeeding. */
    if (echo) {
      displayData(data, 'tx');
    }

    if (logTx) {
      addLogEntry('tx', data);
    }

    await state.link.write(data);

    state.txBytes += data.length;
    updateStats();

    return data;
  }

  // Catalog sources differ per firmware: melexis_io and evb-gen3 answer
  // :SYST:HELP:LIST, mip-firmware does not implement it and exposes the same
  // list as a RAM file instead. Both are optional — whatever happens, the help
  // probe must still run, or an unsupported device ends up with no help at all.
  /* The Melexis IO board is USB CDC and takes any line coding, so the settings
     in the sidebar cost nothing there. An ST-Link is not the same thing: it
     bridges to a real UART, and the firmware behind it runs 115200 7O2 and
     nothing else. Connecting with anything else looks identical and stays
     silent. */
  const STLINK_UART = { baudRate: 115200, dataBits: 7, parity: 'odd', stopBits: 2 };

  function warnAboutLineSettings(device, options) {
    if (!/ST-Link/i.test(device)) return;
    const wrong = Object.keys(STLINK_UART).filter((key) => options[key] !== STLINK_UART[key]);
    if (wrong.length === 0) return;
    logError("An ST-Link bridges to a UART that needs 115200 7O2 — set that in the "
      + "sidebar and reconnect, or pick the board's own port instead.");
  }

  /* Auto takes the settings from the device that was picked — 115200 8N1 for
     everything here except an ST-Link's 7O2 UART — and shows them in the fields
     afterwards, so what was used is visible rather than implied. Custom hands
     the fields back to the operator. */
  function lineOptions(port) {
    const flowControl = els.flowControl.value;
    if (els.lineMode.value !== 'auto') {
      return {
        baudRate:    parseInt(els.baudRate.value, 10),
        dataBits:    parseInt(els.dataBits.value, 10),
        stopBits:    parseInt(els.stopBits.value, 10),
        parity:      els.parity.value,
        flowControl,
      };
    }
    const line = window.melexisSerial?.lineOptions(port)
      ?? { baudRate: 115200, dataBits: 8, parity: 'none', stopBits: 1 };
    els.baudRate.value = String(line.baudRate);
    els.dataBits.value = String(line.dataBits);
    els.stopBits.value = String(line.stopBits);
    els.parity.value = line.parity;
    return { ...line, flowControl };
  }

  function applyLineMode() {
    const automatic = els.lineMode.value === 'auto';
    for (const field of [els.baudRate, els.dataBits, els.stopBits, els.parity]) {
      field.disabled = automatic;
    }
  }

  /* A device that was never going to answer connects exactly like one that
     will, and the probes that follow only report their own timeouts, which say
     nothing about the cause. If not one byte arrives, name the two things that
     are usually behind it. */
  const SILENCE_HINT_MS = 3000;

  function watchForSilence() {
    const bytesAtConnect = state.rxBytes;
    setTimeout(() => {
      if (!state.isConnected || state.rxBytes !== bytesAtConnect) return;
      logError('This device has not sent a single byte. Either the picker offered '
        + 'another CDC port — an ST-Link exposes one, and its UART needs 115200 7O2 — '
        + 'or the board is not the one you meant. Disconnect and try the other port.');
    }, SILENCE_HINT_MS);
  }

  async function requestCommandCatalog() {
    if (!state.isConnected) return;

    await runOptionalCatalogProbe('commandCatalog', AUTOCOMPLETE_PROBE_COMMAND,
      'Autocomplete command list timed out.',
      (ok) => (ok ? requestCommandHelpCatalog() : requestCommandCatalogFile()));
  }

  async function requestCommandCatalogFile() {
    if (!state.isConnected) return;

    await runOptionalCatalogProbe('commandCatalogFile', AUTOCOMPLETE_FILE_PROBE_COMMAND,
      'Autocomplete command file timed out.',
      () => requestCommandHelpCatalog());
  }

  async function runOptionalCatalogProbe(kind, command, timeoutMessage, next) {
    try {
      await startProbe(kind, command, { optional: true, timeoutMessage, next });
    } catch (err) {
      logError(`${formatProbeName(kind)} probe failed: ${err.message}`);
      resetActiveProbe();
      next(false);
    }
  }

  async function requestCommandHelpCatalog() {
    if (!state.isConnected) return;

    try {
      await startProbe('commandHelp', COMMAND_HELP_PROBE_COMMAND, {
        timeoutMessage: 'Command help download timed out.',
      });
    } catch (err) {
      failActiveProbe(`Command help probe failed: ${err.message}`);
    }
  }

  async function startProbe(kind, command, options = {}) {
    resetActiveProbe();

    const probe = state.activeProbe;
    probe.active = true;
    probe.kind = kind;
    probe.buffer = '';
    probe.optional = options.optional === true;
    probe.next = options.next || null;
    probe.timerId = window.setTimeout(() => {
      failActiveProbe(options.timeoutMessage);
    }, AUTOCOMPLETE_PROBE_TIMEOUT_MS);

    await sendRawText(command, {
      echo: false,
      logTx: false,
    });
  }

  function processProbeChunk(data) {
    const probe = state.activeProbe;
    if (!probe.active) return false;

    probe.buffer += probe.decoder.decode(data, { stream: true });

    // Tolerate a prompt at the very start of the buffer and trailing whitespace
    // after '>', both of which the anchored form used to miss (silent timeout).
    const match = probe.buffer.match(/(?:^|\r?\n)\((\w+)\)>\s*$/);
    if (!match) {
      return true;
    }

    const status = match[1];
    const payload = probe.buffer.slice(0, match.index);
    const { kind, optional, next } = probe;

    resetActiveProbe();

    const ok = status === 'OK';

    if (!ok) {
      if (optional) {
        logSystem(`${formatProbeName(kind)} is not available on this firmware.`);
      } else {
        logError(`${formatProbeName(kind)} probe failed with device status: ${status}`);
      }
    } else {
      handleProbeSuccess(kind, payload);
    }

    if (next) next(ok);

    return true;
  }

  function handleProbeSuccess(kind, payload) {
    if (kind === 'commandCatalog' || kind === 'commandCatalogFile') {
      const commands = extractCommandCatalog(payload);
      state.commandCatalog = commands;
      syncCommandSuggestions();
      logSystem(`Loaded ${commands.length} commands for autocomplete.`);
      return;
    }

    if (kind === 'commandHelp') {
      state.commandHelpRaw = payload.trim();
      state.commandHelpIndex = extractCommandHelpIndex(payload, state.commandCatalog);
      updateSelectedCommandHelp();
      logSystem(`Loaded help for ${Object.keys(state.commandHelpIndex).length} commands.`);
    }
  }

  function extractCommandCatalog(payload) {
    return Array.from(new Set(
      payload
        .split(/\s+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .filter((entry) => entry !== ':syst:help:list')
        .filter((entry) => /^[:*][A-Za-z0-9:_?-]*$/.test(entry))
    ));
  }

  function syncCommandSuggestions() {
    if (!els.commandSuggestions) return;

    els.commandSuggestions.innerHTML = '';

    const fragment = document.createDocumentFragment();
    for (const command of state.commandCatalog) {
      const option = document.createElement('option');
      option.value = command;
      fragment.appendChild(option);
    }

    els.commandSuggestions.appendChild(fragment);
  }

  function clearCommandCatalog() {
    state.commandCatalog = [];
    state.commandHelpRaw = '';
    state.commandHelpIndex = {};
    syncCommandSuggestions();
    updateSelectedCommandHelp();
  }

  function failActiveProbe(message) {
    const probe = state.activeProbe;
    if (!probe.active) return;

    const { optional, next } = probe;
    resetActiveProbe();

    if (!optional) {
      logError(message);
    }

    if (next) next(false);
  }

  function resetActiveProbe() {
    const probe = state.activeProbe;
    if (probe.timerId !== null) {
      window.clearTimeout(probe.timerId);
    }

    state.activeProbe = createProbeState();
  }

  function formatProbeName(kind) {
    if (kind === 'commandHelp') return 'Command help';
    if (kind === 'commandCatalogFile') return 'Autocomplete command file';
    return 'Autocomplete command list';
  }

  function extractCommandHelpIndex(payload, commands) {
    const normalizedCommands = commands
      .map((command) => command.trim())
      .filter(Boolean)
      .sort((left, right) => right.length - left.length);

    const lines = payload
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.trimEnd());

    const sections = {};
    let currentCommand = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (currentCommand && sections[currentCommand].length > 0) {
          sections[currentCommand].push('');
        }
        continue;
      }

      const matchedCommand = findCommandHeader(line, normalizedCommands);
      if (matchedCommand) {
        currentCommand = matchedCommand;
        if (!sections[currentCommand]) {
          sections[currentCommand] = [];
        }
      }

      if (currentCommand) {
        sections[currentCommand].push(rawLine);
      }
    }

    return Object.fromEntries(
      Object.entries(sections)
        .map(([command, sectionLines]) => [command, sectionLines.join('\n').trim()])
        .filter(([, section]) => section)
    );
  }

  function findCommandHeader(line, commands) {
    for (const command of commands) {
      if (!line.startsWith(command)) continue;

      const nextChar = line.charAt(command.length);
      if (!nextChar || /[\s:=-]/.test(nextChar)) {
        return command;
      }
    }

    return null;
  }

  function updateSelectedCommandHelp() {
    if (!els.commandHelpText || !els.commandHelpStatus) return;

    const selectedCommand = els.messageInput.value.trim();
    const helpText = state.commandHelpIndex[selectedCommand] || '';

    if (!state.isConnected) {
      els.commandHelpStatus.textContent = 'Connect to load command help.';
      els.commandHelpText.textContent = '';
      return;
    }

    if (!state.commandHelpRaw) {
      els.commandHelpStatus.textContent = 'Loading command help…';
      els.commandHelpText.textContent = '';
      return;
    }

    if (!selectedCommand) {
      els.commandHelpStatus.textContent = 'Select a suggested command to view help.';
      els.commandHelpText.textContent = '';
      return;
    }

    if (!helpText) {
      els.commandHelpStatus.textContent = `No saved help found for ${selectedCommand}.`;
      els.commandHelpText.textContent = '';
      return;
    }

    els.commandHelpStatus.textContent = selectedCommand;
    els.commandHelpText.textContent = helpText;
  }

  function createRenderState() {
    return {
      bytes: [],
      lineEl: null,
      msgEl: null,
      hexEl: null,
      pendingCarriageReturn: false,
    };
  }

  function ensureRenderedLine(direction) {
    const stream = state.renderState[direction];
    if (stream.lineEl) return;

    const showTs = els.showTimestamps.checked;
    const ts = showTs ? formatTimestamp() : null;
    const line = document.createElement('div');
    line.className = 'term-line';

    if (ts) {
      const tsEl = document.createElement('span');
      tsEl.className = 'term-line__ts';
      tsEl.textContent = ts;
      line.appendChild(tsEl);
    }

    const dirEl = document.createElement('span');
    dirEl.className = `term-line__dir term-line__dir--${direction}`;
    dirEl.textContent = direction === 'tx' ? 'TX' : 'RX';
    line.appendChild(dirEl);

    const msgEl = document.createElement('span');
    msgEl.className = 'term-line__msg';
    line.appendChild(msgEl);

    appendTerminalLine(line);

    stream.lineEl = line;
    stream.msgEl = msgEl;

    if (els.displayMode.value === 'both') {
      const hexLine = document.createElement('div');
      hexLine.className = 'term-hex';
      appendTerminalLine(hexLine);
      stream.hexEl = hexLine;
    }
  }

  function updateRenderedLine(direction) {
    const stream = state.renderState[direction];
    if (!stream.msgEl) return;

    const data = Uint8Array.from(stream.bytes);
    const mode = els.displayMode.value;

    stream.msgEl.textContent = mode === 'hex'
      ? toHexString(data)
      : new TextDecoder().decode(data);

    if (mode === 'both') {
      if (!stream.hexEl) {
        stream.hexEl = document.createElement('div');
        stream.hexEl.className = 'term-hex';
        stream.lineEl.after(stream.hexEl);
      }
      stream.hexEl.textContent = toHexString(data);
    } else if (stream.hexEl) {
      stream.hexEl.remove();
      stream.hexEl = null;
    }
  }

  function finalizeRenderedLine(direction) {
    const stream = state.renderState[direction];
    ensureRenderedLine(direction);
    updateRenderedLine(direction);
    stream.bytes = [];
    stream.lineEl = null;
    stream.msgEl = null;
    stream.hexEl = null;
  }

  function resetRenderedLines() {
    state.renderState.rx = createRenderState();
    state.renderState.tx = createRenderState();
  }

  function handleHistoryNavigation(event) {
    if (state.commandHistory.length === 0) return;

    event.preventDefault();

    if (event.key === 'ArrowUp') {
      if (state.historyIndex === null) {
        state.draftCommand = els.messageInput.value;
        state.historyIndex = state.commandHistory.length - 1;
      } else if (state.historyIndex > 0) {
        state.historyIndex -= 1;
      }
    } else if (event.key === 'ArrowDown') {
      if (state.historyIndex === null) return;

      if (state.historyIndex < state.commandHistory.length - 1) {
        state.historyIndex += 1;
      } else {
        state.historyIndex = null;
        applyInputValue(state.draftCommand);
        return;
      }
    }

    applyInputValue(state.commandHistory[state.historyIndex]);
  }

  // Assigning .value does not fire an `input` event, so the help panel has to
  // be refreshed explicitly whenever we write to the field ourselves.
  function applyInputValue(value) {
    els.messageInput.value = value;
    moveCursorToEnd(els.messageInput);
    updateSelectedCommandHelp();
  }

  function addCommandToHistory(command) {
    const normalizedCommand = command.trim();
    if (!normalizedCommand) return;

    if (state.commandHistory[state.commandHistory.length - 1] === normalizedCommand) {
      return;
    }

    state.commandHistory.push(normalizedCommand);

    if (state.commandHistory.length > COMMAND_HISTORY_LIMIT) {
      state.commandHistory = state.commandHistory.slice(-COMMAND_HISTORY_LIMIT);
    }

    saveCommandHistory();
  }

  function loadCommandHistory() {
    try {
      const rawHistory = window.localStorage.getItem(COMMAND_HISTORY_KEY);
      if (!rawHistory) return;

      const parsedHistory = JSON.parse(rawHistory);
      if (!Array.isArray(parsedHistory)) return;

      state.commandHistory = parsedHistory
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(-COMMAND_HISTORY_LIMIT);
    } catch {
      state.commandHistory = [];
    }
  }

  function saveCommandHistory() {
    try {
      window.localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(state.commandHistory));
    } catch {
      // Ignore storage failures so serial I/O remains unaffected.
    }
  }

  function moveCursorToEnd(input) {
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }


  // ---- Log Management ----

  function addLogEntry(type, data) {
    const entry = {
      time: new Date().toISOString(),
      type,
      data: typeof data === 'string'
        ? data
        : new TextDecoder().decode(data),
      hex: typeof data !== 'string'
        ? toHexString(data)
        : null,
    };
    state.logEntries.push(entry);

    if (state.logEntries.length > LOG_ENTRY_LIMIT) {
      state.logEntries.shift();
    }
  }

  function clearTerminal() {
    els.terminalOutput.innerHTML = '';
    state.logEntries = [];
    state.txBytes = 0;
    state.rxBytes = 0;
    resetRenderedLines();
    updateStats();
    logSystem('Terminal cleared.');
  }

  const LOG_LABELS = { rx: 'RX ', tx: 'TX ', sys: 'SYS', err: 'ERR' };

  function exportLog() {
    if (state.logEntries.length === 0) {
      logSystem('Nothing to export.');
      return;
    }

    // Entries were previously concatenated with no separator, which glued
    // device output, local echo and system messages into one unreadable run.
    const includeHex = els.displayMode.value !== 'ascii';
    const lines = [];

    for (const entry of state.logEntries) {
      const label = LOG_LABELS[entry.type] || entry.type.toUpperCase();
      const body = entry.data.replace(/\r/g, '').replace(/\n+$/, '');

      if (body) {
        for (const line of body.split('\n')) {
          lines.push(`[${entry.time}] ${label} ${line}`);
        }
      }

      if (includeHex && entry.hex) {
        lines.push(`[${entry.time}] ${label} hex: ${entry.hex}`);
      }
    }

    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `serial-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    logSystem(`Exported ${state.logEntries.length} entries.`);
  }


  /* Two copies of this page both grabbing the board is the one way connecting
     on load misfires: the second open takes the port and the first is told
     "The device has been lost", which reads like a hardware fault and is not
     one. Tabs announce ownership to each other so only one claims it without
     being asked. A manual Connect still wins — the user asking for this tab is
     a good enough reason to take the port. */
  /* Shared with the sensor pages, so it does not matter which of them holds
     the board; js/serial-port.js explains why the coordination exists. */
  const claims = window.melexisSerial?.claim ?? {
    announce() {}, release() {}, heldElsewhere() { return Promise.resolve(false); },
  };

  // ---- Boot ----
  /* No reconnect on load: which port this talks to is a decision the operator
     makes at Connect, every time. */
  document.addEventListener('DOMContentLoaded', () => {
    init();
    els.lineMode.addEventListener('change', applyLineMode);
    applyLineMode();
  });

})();
