/**
 * mlx_api.js
 * Complete MLX90396 API - SCPI Tunneling Version
 */

// Bit names of the warning (0x42) and error (0x41) registers, bit 0 first
// (datasheet V0.5 tables 18-23). Reading either register clears the matching
// INFO/WARN or ERROR flag in the status byte.
const WARN_FLAGS = ['MI6', 'RST', 'OVF', 'SEC', 'OV_VDDD', 'UV_VDD', 'OV_VDD', 'UV_TEMP',
  'OV_TEMP', 'WOC_M1', 'WOC_M2', 'WOC_M3', 'WOC_M4', 'WOC_M5', 'WOC_M6', 'WOC_T'];
const ERROR_FLAGS = ['CE_CRC', 'CE_INVALID', 'DED', 'CRCERR', 'BUS_ERROR', 'DIAG_ADC',
  'DIAG_LFO', 'DIAG_OSC', 'DIAG_DIE', 'DIAG_HP', 'DIAG_INTB'];

// Plain-language reading of the flags a demo is likely to hit.
export const FLAG_TEXT = {
  RST: 'chip reset (normal after power-up)',
  OVF: 'ADC overflow - signal too strong for the gain',
  MI6: 'more than 6 channels requested',
  UV_VDD: 'supply voltage too low',
  OV_VDD: 'supply voltage too high',
  BUS_ERROR: 'internal bus error - a register write during a measurement',
  CE_INVALID: 'command rejected',
  CE_CRC: 'command CRC error',
  CRCERR: 'port CRC error',
  DIAG_ADC: 'ADC self-check failed',
  DIAG_HP: 'Hall element or gain chain fault'
};

function flagNames(table, value) {
  return table.filter((_, bit) => (value >> bit) & 1);
}

export class MLX90396_API {
    
  static Mlx90396Command = {
      RT: 0xF0,       // Reset
      HS: 0xE0,       // Memory Store
      HR: 0xD0,       // Memory Recall
      EX: 0x80,       // Exit Mode
      RR: 0x50,       // Read Register
      WR: 0x60,       // Write Register
      SB: 0x10,       // Start Burst
      SWOC: 0x20,     // Start WOC
      SM: 0x30,       // Start Single Measurement
      RM_NO_TEMP: 0x40, // Read Measurement (No Temp)
      // The datasheet contradicts itself on the temperature bit: table 24 says
      // bit 3 (0b0100 T000 = 0x48), table 27 says bit 0 (0b0100 000T = 0x41).
      // The hardware-verified reference implementation drives bit 0 and that is
      // what works on the bench - verify on the part before relying on it.
      RM_TEMP: 0x41   // Read Measurement (With Temp)
  };

  constructor(scpiQueryFn, getSpiPrefixFn = () => ":SPI") {
      this.query = scpiQueryFn;
      this._busLock = Promise.resolve();
      this.getSpiPrefix = typeof getSpiPrefixFn === 'function' ? getSpiPrefixFn : () => getSpiPrefixFn;
  }

  // --- Bus ownership ---
  // Every public method below holds the bus for its whole duration and calls
  // the unlocked _-prefixed internals. Without it, concurrent callers
  // interleaved inside one chip-select window (two SPI frames between a single
  // CS0 0 / CS0 1 pair) and split multi-step operations such as setGain's
  // unlock-read-modify-write, which the part answers with BUS_ERROR.
  _op(fn) {
      const run = this._busLock.then(() => fn());
      this._busLock = run.then(() => {}, () => {});
      return run;
  }

  rt(...args) { return this._op(() => this._rt(...args)); }
  hs(...args) { return this._op(() => this._hs(...args)); }
  hr(...args) { return this._op(() => this._hr(...args)); }
  ex(...args) { return this._op(() => this._ex(...args)); }
  rr(...args) { return this._op(() => this._rr(...args)); }
  wr(...args) { return this._op(() => this._wr(...args)); }
  sb(...args) { return this._op(() => this._sb(...args)); }
  swoc(...args) { return this._op(() => this._swoc(...args)); }
  sm(...args) { return this._op(() => this._sm(...args)); }
  rm(...args) { return this._op(() => this._rm(...args)); }
  rmStatus(...args) { return this._op(() => this._rmStatus(...args)); }
  awaitReady(...args) { return this._op(() => this._awaitReady(...args)); }
  setGain(...args) { return this._op(() => this._setGain(...args)); }
  readGain(...args) { return this._op(() => this._readGain(...args)); }
  readFlags(...args) { return this._op(() => this._readFlags(...args)); }

  async _send_spi(mosi_data, miso_len) {
      const prefix = this.getSpiPrefix();
      const txArray = [...mosi_data];
      for (let i = 0; i < miso_len; i++) {
          txArray.push(0x00);
      }
      const decStr = txArray.join(',');
      
      await this.query(`${prefix}:CS0 0`);

      const scpiCmd = `${prefix}:WriteReaD ${decStr}`;
      let response;
      try {
          response = await this.query(scpiCmd);
      } finally {
          // Release chip select even when the transfer timed out; a part left
          // selected misreads every following frame. The transfer's own error
          // is the one that propagates.
          await Promise.resolve(this.query(`${prefix}:CS0 1`)).catch(() => {});
      }

      // No reply (or a short one) comes back as all zeros, which _verify_crc
      // rejects, so every command reports it as an error instead of data 0.
      if (!response) return Array(miso_len).fill(0);

      const stripped = response.replace(scpiCmd, '').trim();
      const tokens = stripped.match(/0x[0-9a-fA-F]+|[0-9a-fA-F]+/g) || [];
      const rx = tokens.map(tok => parseInt(tok, 16));

      if (rx.length >= mosi_data.length + miso_len) {
          return rx.slice(mosi_data.length, mosi_data.length + miso_len);
      }
      if (rx.length >= miso_len) {
          return rx.slice(-miso_len);
      }
      return Array(miso_len).fill(0);
  }

  _crc_2f(message) {
      let crc = 0xFF; 
      for (let i = 0; i < message.length; i++) {
          crc = crc ^ message[i];
          for (let j = 0; j < 8; j++) {
              if ((crc & 0x80) === 0) crc = (crc << 1) & 0xFF;
              else crc = ((crc << 1) ^ 0x2F) & 0xFF;
          }
      }
      return (crc ^ 0xFF) & 0xFF; 
  }

  _verify_crc(message, expected_crc) {
      // An all-zero frame is no reply or a MISO line stuck low. It would pass
      // the AAA (0x00-init) check below, so it is rejected explicitly. The cost
      // is that an AAA part's genuine all-zero reply also counts as an error.
      if (expected_crc === 0 && message.every(b => b === 0)) return false;
      let crcFF = 0xFF; 
      for (let i = 0; i < message.length; i++) {
          crcFF ^= message[i];
          for (let j = 0; j < 8; j++) {
              crcFF = (crcFF & 0x80) ? ((crcFF << 1) ^ 0x2F) & 0xFF : (crcFF << 1) & 0xFF;
          }
      }
      if (((crcFF ^ 0xFF) & 0xFF) === expected_crc) return true;

      let crc00 = 0x00; 
      for (let i = 0; i < message.length; i++) {
          crc00 ^= message[i];
          for (let j = 0; j < 8; j++) {
              crc00 = (crc00 & 0x80) ? ((crc00 << 1) ^ 0x2F) & 0xFF : (crc00 << 1) & 0xFF;
          }
      }
      if (((crc00 ^ 0x00) & 0xFF) === expected_crc) return true;

      return false; 
  }

  _s16(u) {
      let val = (u << 4) & 0xFFFF;
      if (val & 0x8000) val = val - 0x10000;
      return val >> 4;
  }

  _checkMaskLimit(data_mask) {
      // The part measures at most 6 channels per SM/SB/SWOC/RM, and MI6 is the
      // warning flag for over-asking. The mask is 20 bits (0..19); only bits
      // 2..19 select measurement channels, so reserved bit 0 and the supply bit
      // (bit 1) are excluded from the budget check instead of refusing.
      let count = 0;
      let temp_mask = data_mask & 0xFFFFFC;
      while (temp_mask) {
          temp_mask &= (temp_mask - 1);
          if (++count > 6) return true;
      }
      return false;
  }

  async _rt() {
      const mosi = [MLX90396_API.Mlx90396Command.RT, 0];
      mosi[1] = this._crc_2f(mosi.slice(0, 1));
      const miso = await this._send_spi(mosi, 2);
      return !this._verify_crc(miso.slice(0, 1), miso[1]); 
  }

  async _hs() {
      const mosi = [MLX90396_API.Mlx90396Command.HS, 0];
      mosi[1] = this._crc_2f(mosi.slice(0, 1));
      const miso = await this._send_spi(mosi, 2);
      return !this._verify_crc(miso.slice(0, 1), miso[1]); 
  }

  async _hr() {
      const mosi = [MLX90396_API.Mlx90396Command.HR, 0];
      mosi[1] = this._crc_2f(mosi.slice(0, 1));
      const miso = await this._send_spi(mosi, 2);
      return !this._verify_crc(miso.slice(0, 1), miso[1]); 
  }

  async _ex(mode) {
      const mosi = [MLX90396_API.Mlx90396Command.EX | (0x0F & mode), 0];
      mosi[1] = this._crc_2f(mosi.slice(0, 1));
      const miso = await this._send_spi(mosi, 2);
      return !this._verify_crc(miso.slice(0, 1), miso[1]); 
  }

  async _rr(reg) {
      const mosi = [MLX90396_API.Mlx90396Command.RR, reg, 0];
      mosi[2] = this._crc_2f(mosi.slice(0, 2));
      const miso = await this._send_spi(mosi, 4);
      
      const error = !this._verify_crc(miso.slice(0, 3), miso[3]);
      const data = (miso[1] << 8) | miso[2];
      
      return { error, status: miso[0], data }; 
  }

  async _wr(reg, data) {
      const mosi = [
          MLX90396_API.Mlx90396Command.WR,
          reg,
          (data >> 8) & 0xFF,
          data & 0xFF,
          0
      ];
      mosi[4] = this._crc_2f(mosi.slice(0, 4));
      const miso = await this._send_spi(mosi, 2);
      return !this._verify_crc(miso.slice(0, 1), miso[1]);
  }

  async _sb(data_mask) {
      if (this._checkMaskLimit(data_mask)) return true;
      const mosi = [
          MLX90396_API.Mlx90396Command.SB | ((data_mask >> 16) & 0x0F),
          (data_mask >> 8) & 0xFF,
          data_mask & 0xFF,
          0 
      ];
      mosi[3] = this._crc_2f(mosi.slice(0, 3));
      const miso = await this._send_spi(mosi, 2);
      return !this._verify_crc(miso.slice(0, 1), miso[1]);
  }

  async _swoc(data_mask) {
      if (this._checkMaskLimit(data_mask)) return true;
      const mosi = [
          MLX90396_API.Mlx90396Command.SWOC | ((data_mask >> 16) & 0x0F),
          (data_mask >> 8) & 0xFF,
          data_mask & 0xFF,
          0 
      ];
      mosi[3] = this._crc_2f(mosi.slice(0, 3));
      const miso = await this._send_spi(mosi, 2);
      return !this._verify_crc(miso.slice(0, 1), miso[1]);
  }

  async _sm(data_mask) {
      if (this._checkMaskLimit(data_mask)) return true;
      const mosi = [
          MLX90396_API.Mlx90396Command.SM | ((data_mask >> 16) & 0x0F),
          (data_mask >> 8) & 0xFF,
          data_mask & 0xFF,
          0 
      ];
      mosi[3] = this._crc_2f(mosi.slice(0, 3));
      const miso = await this._send_spi(mosi, 2);
      return !this._verify_crc(miso.slice(0, 1), miso[1]);
  }

  // Universal dynamic read
  async _rm(temp, data_mask) {
      if (this._checkMaskLimit(data_mask)) return { error: true, msg: "Limit Exceeded (Max 6 axes)" };
      
      const mosi = [temp ? MLX90396_API.Mlx90396Command.RM_TEMP : MLX90396_API.Mlx90396Command.RM_NO_TEMP, 0];
      mosi[1] = this._crc_2f(mosi.slice(0, 1));
      
      const keys = [
          'x0', 'y0', 'z0', 'x1', 'y1', 'z1', 'x2', 'y2', 'z2', 'x3', 'y3', 'z3',
          'x02', 'y02', 'z02', 'x13', 'y13', 'z13', 'vdd'
      ];
      
      let activeKeys = [];
      for (let i = 0; i < 19; i++) {
          const bitPos = 19 - i;
          if ((data_mask & (1 << bitPos)) !== 0) {
              activeKeys.push(keys[i]);
          }
      }
      
      const miso_len = 1 + (temp ? 2 : 0) + (activeKeys.length * 2) + 1;
      const miso = await this._send_spi(mosi, miso_len);
      
      let result = { raw: miso };
      let offset = 1; 

      if (temp) {
          const w = (miso[offset] << 8) | miso[offset + 1];
          result.t = this._s16(w);
          offset += 2;
      }
      
      for (let key of activeKeys) {
          const w = (miso[offset] << 8) | miso[offset + 1];
          result[key] = this._s16(w);
          offset += 2;
      }
      
      result.error = !this._verify_crc(miso.slice(0, offset), miso[offset]);
      result.status = miso[0];

      return result;
  }

  // Status-only RM: returns { ok, status } without consuming the pending
  // measurement, mirroring the readout page's DRDY poll (sampleOnce issues a
  // 1-byte RM against a deadline, then reads the full frame).
  async _rmStatus() {
      const mosi = [MLX90396_API.Mlx90396Command.RM_NO_TEMP, 0];
      mosi[1] = this._crc_2f(mosi.slice(0, 1));
      // Read the status byte only. The RM reply is status, then the selected
      // channel words, then ONE CRC over the whole frame - so the byte after the
      // status is DATA, not a CRC. Verifying against it always failed, which
      // stopped awaitReady() from ever observing DRDY and made every poll burn
      // its full deadline. A lone status byte carries no CRC of its own; the
      // reference page polls it exactly this way (exchange(1, [CMD_RM])).
      const miso = await this._send_spi(mosi, 1);
      if (!miso || miso.length < 1) return { ok: false, status: 0 };
      return { ok: true, status: miso[0] };
  }

  // Wait for conversion-complete after SM: polls the status byte about every
  // 2 ms up to deadlineMs, then proceeds regardless so a slow or silent part
  // can never stall the loop. Returns true when DRDY (status bit 0) was seen.
  async _awaitReady(deadlineMs = 10) {
      const t0 = Date.now();
      for (;;) {
          try {
              const st = await this._rmStatus();
              if (st.ok && (st.status & 0x01)) return true;
          } catch (_) { /* transport hiccup: retry until the deadline */ }
          if (Date.now() - t0 >= deadlineMs) return false;
          await new Promise(r => setTimeout(r, 2));
      }
  }

  // GAINSEL fields share register 0x00: bits[5:0] = 1px, bits[11:6] = 2px.
  // Writes require the unlock sequence (datasheet 15.4.3) and must preserve the
  // other field; a readback then confirms what the part actually holds.
  async _setGain(mode, gainValue, persist = false) {
      if (await this._wr(0x43, 0x9952)) return { ok: false };
      if (await this._wr(0x44, 0x84DE)) return { ok: false };

      const is2px = mode === '2px';
      const readRes = await this._rr(0x00);
      // Abort on a failed read: substituting 0 would wipe the other mode's
      // gain field instead of failing safe.
      if (readRes.error) return { ok: false };
      const currentVal = readRes.data;

      const gainField = gainValue & 0x003F;
      // Preserve everything outside the written field, including bits 15:12 -
      // the old positive masks zeroed the upper nibble on every gain write.
      const updatedVal = is2px
          ? (currentVal & ~0x0FC0) | (gainField << 6)
          : (currentVal & ~0x003F) | gainField;

      if (await this._wr(0x00, updatedVal)) return { ok: false };

      const verifyRes = await this._rr(0x00);
      const verifiedField = is2px
          ? (verifyRes.data >> 6) & 0x003F
          : verifyRes.data & 0x003F;
      const ok = !verifyRes.error && verifiedField === gainField;

      if (ok && persist) await this._hs();

      return { ok, value: ok ? verifiedField : null, raw: verifyRes.data };
  }

  // Reads the warning (0x42) and/or error (0x41) register and returns the names
  // of the latched bits. Reading clears the flag, so a power-up RST or a single
  // ADC overflow does not keep WARN set for the rest of the session. Call it
  // only between measurements (right after RM): on the bench a register read
  // issued while a conversion was in flight came back as 0, and a write there
  // was rejected with BUS_ERROR.
  async _readFlags({ warn = true, error = true } = {}) {
      const out = { warn: [], error: [], failed: false };
      if (warn) {
          const r = await this._rr(0x42);
          if (r.error) out.failed = true; else out.warn = flagNames(WARN_FLAGS, r.data);
      }
      if (error) {
          const r = await this._rr(0x41);
          if (r.error) out.failed = true; else out.error = flagNames(ERROR_FLAGS, r.data);
      }
      return out;
  }

  async _readGain(mode) {
      const readRes = await this._rr(0x00);
      if (readRes.error) return { error: true, value: null, raw: null };
      const value = mode === '2px'
          ? (readRes.data >> 6) & 0x003F
          : readRes.data & 0x003F;
      return { error: false, value, raw: readRes.data };
  }

  // Alias wrapper for legacy calls
  async rm_joystick_xyz(temp, data_mask) {
      return this.rm(temp, data_mask);
  }
}
