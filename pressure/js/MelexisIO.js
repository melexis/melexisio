// MelexisIO Web Serial implementation
// Ported conceptually from .src/90835_python_api/source/MelexisIO.py
// Requires Chrome with Web Serial API (navigator.serial)
// Usage:
//   const io = new MelexisIOcomm({ baudRate: 921600 });
//   await io.open();
//   const resp = await io.command('*IDN?');
//   await io.close();

export class MelexisIOException extends Error {}
export class MelexisIOExcError extends Error {}

export class MelexisIO {
  constructor() {
    this._debugOn = false;
    this._timeoutMs = 30000;
    this._connection = null; // SerialPort
    this._id = '';
    this._reader = null; // ReadableStreamDefaultReader
    this._writer = null; // WritableStreamDefaultWriter
    this._textDecoder = new TextDecoder();
    this._textEncoder = new TextEncoder();
  }

  DBG(text) { if (this._debugOn) console.log(text); }

  async open(reset = false, checkid = false) { throw new Error('abstract'); }
  async close() { throw new Error('abstract'); }
  async writer(text) { throw new Error('abstract'); }
  async reader(timeoutSec = 5.0) { throw new Error('abstract'); }

  async writeCommand(command) { await this.writer(command + '\n'); }

  async command(command) {
    await this.writeCommand(command);
    return await this.response();
  }

  async response() {
    let resp = '';
    let result = null;
    const regex = /\([A-Z_]+\)>/;
    const deadline = Date.now() + this._timeoutMs;

    while (result === null && Date.now() < deadline) {
      resp += await this.reader();
      result = regex.exec(resp);
    }
    this.DBG(resp);

    if (result === null) {
      throw new MelexisIOExcError(resp.slice(-200));
    } else if (result[0] === '(OK)>') {
      return resp;
    } else {
      throw new MelexisIOExcError(`ERR:${result[0]}, ${resp.slice(-200)}`);
    }
  }

  get id() { return this._id; }
  get debug() { return this._debugOn; }
  set debug(v) { this._debugOn = !!v; }
}

export class MelexisIOcomm extends MelexisIO {
  constructor(options = {}) {
    super();
    this.options = {
      usbVendorId: options.usbVendorId, // optional filter
      usbProductId: options.usbProductId, // optional filter
      baudRate: options.baudRate ?? 921600,
      dataBits: options.dataBits ?? 7,
      stopBits: options.stopBits ?? 2,
      parity: options.parity ?? 'odd', // 'none' | 'even' | 'odd'
      bufferSize: options.bufferSize ?? 256,
    };
  }

  async open(reset = false, checkid = false) {
    if (!('serial' in navigator)) throw new MelexisIOException('Web Serial API not available');

    // Build filters correctly: a filter with usbProductId must include the matching usbVendorId
    const filters = [];
    if (this.options.usbVendorId && this.options.usbProductId) {
      filters.push({ usbVendorId: this.options.usbVendorId, usbProductId: this.options.usbProductId });
    } else if (this.options.usbVendorId) {
      filters.push({ usbVendorId: this.options.usbVendorId });
    } // else no filters, chooser will list all serial-capable ports

    const port = await navigator.serial.requestPort(filters.length ? { filters } : {});
    await port.open({
      baudRate: this.options.baudRate,
      dataBits: this.options.dataBits,
      stopBits: this.options.stopBits,
      parity: this.options.parity,
      bufferSize: this.options.bufferSize,
    });

    this._connection = port;
    this._reader = port.readable.getReader();
    this._writer = port.writable.getWriter();

    if (checkid) {
      this._id = await this.command('*IDN?');
      return /(OK)/.test(this._id);
    }
    return true;
  }

  async close() {
    this._id = '<closed>';
    try {
      if (this._reader) { await this._reader.cancel(); this._reader.releaseLock(); }
      if (this._writer) { await this._writer.releaseLock(); }
      if (this._connection) { await this._connection.close(); }
    } finally {
      this._reader = null; this._writer = null; this._connection = null;
    }
    return true;
  }

  async writer(text) {
    if (!this._writer) throw new MelexisIOException('Writer not initialized');
    const data = this._textEncoder.encode(text);
    await this._writer.write(data);
  }

  async reader(timeoutSec = 5.0) {
    if (!this._reader) throw new MelexisIOException('Reader not initialized');
    const deadline = Date.now() + timeoutSec * 1000;
    let chunks = '';
    while (Date.now() < deadline) {
      const { value, done } = await this._reader.read();
      if (done) break;
      if (value && value.length) {
        chunks += this._textDecoder.decode(value, { stream: true });
        // If there's already some prompt-like content, return early to allow parsing loop
        if (chunks.length > 0) break;
      }
    }
    return chunks;
  }

  get port() { return this._connection; }
}
