// MLX90835 I2C JavaScript module
// Ported from .src/90835_python_api/source/mlx90835_i2c.py
// Runtime-agnostic: requires a transport object to handle I2C exchanges.
// Expected transport interface:
//   - async exchange(addr, rxLen, txBytes) => returns Array<number> of bytes
//   - async read(addr, words) => returns Array<number> of 16-bit integers (word list)
//   - async write(addr, txBytes) => writes bytes, returns optional status

export class MLX90835 {
  constructor(transport, options = {}) {
    this.transport = transport;
    this.address = options.address ?? MLX90835.Config.SLAVE_ADDR;
  }

  static crc_lut = [
    0x00,0x31,0x62,0x53,0xC4,0xF5,0xA6,0x97,0xB9,0x88,0xDB,0xEA,0x7D,0x4C,0x1F,0x2E,
    0x43,0x72,0x21,0x10,0x87,0xB6,0xE5,0xD4,0xFA,0xCB,0x98,0xA9,0x3E,0x0F,0x5C,0x6D,
    0x86,0xB7,0xE4,0xD5,0x42,0x73,0x20,0x11,0x3F,0x0E,0x5D,0x6C,0xFB,0xCA,0x99,0xA8,
    0xC5,0xF4,0xA7,0x96,0x01,0x30,0x63,0x52,0x7C,0x4D,0x1E,0x2F,0xB8,0x89,0xDA,0xEB,
    0x3D,0x0C,0x5F,0x6E,0xF9,0xC8,0x9B,0xAA,0x84,0xB5,0xE6,0xD7,0x40,0x71,0x22,0x13,
    0x7E,0x4F,0x1C,0x2D,0xBA,0x8B,0xD8,0xE9,0xC7,0xF6,0xA5,0x94,0x03,0x32,0x61,0x50,
    0xBB,0x8A,0xD9,0xE8,0x7F,0x4E,0x1D,0x2C,0x02,0x33,0x60,0x51,0xC6,0xF7,0xA4,0x95,
    0xF8,0xC9,0x9A,0xAB,0x3C,0x0D,0x5E,0x6F,0x41,0x70,0x23,0x12,0x85,0xB4,0xE7,0xD6,
    0x7A,0x4B,0x18,0x29,0xBE,0x8F,0xDC,0xED,0xC3,0xF2,0xA1,0x90,0x07,0x36,0x65,0x54,
    0x39,0x08,0x5B,0x6A,0xFD,0xCC,0x9F,0xAE,0x80,0xB1,0xE2,0xD3,0x44,0x75,0x26,0x17,
    0xFC,0xCD,0x9E,0xAF,0x38,0x09,0x5A,0x6B,0x45,0x74,0x27,0x16,0x81,0xB0,0xE3,0xD2,
    0xBF,0x8E,0xDD,0xEC,0x7B,0x4A,0x19,0x28,0x06,0x37,0x64,0x55,0xC2,0xF3,0xA0,0x91,
    0x47,0x76,0x25,0x14,0x83,0xB2,0xE1,0xD0,0xFE,0xCF,0x9C,0xAD,0x3A,0x0B,0x58,0x69,
    0x04,0x35,0x66,0x57,0xC0,0xF1,0xA2,0x93,0xBD,0x8C,0xDF,0xEE,0x79,0x48,0x1B,0x2A,
    0xC1,0xF0,0xA3,0x92,0x05,0x34,0x67,0x56,0x78,0x49,0x1A,0x2B,0xBC,0x8D,0xDE,0xEF,
    0x82,0xB3,0xE0,0xD1,0x46,0x77,0x24,0x15,0x3B,0x0A,0x59,0x68,0xFF,0xCE,0x9D,0xAC
  ];

  static calculate_crc(data) {
    let crc = 0;
    for (const b of data) {
      const d = (b ^ crc) & 0xFF;
      crc = MLX90835.crc_lut[d];
    }
    return crc;
  }

  static Config = {
    API_VER: 'API_VER_MLX90835 VERSION:1.0.0',
    SLAVE_ADDR: 0x33,
    TX_SIZE: 256,
    SOFT_RESET_REQ: 2,
    APPLICATION_INACTIVE: 6,
    DE_NVM_SR: 0x1003,
    MLX_LOG: 1,
    EE_START: 0xFF00,
    EE_END: 0xFF1E,
    EE_SIZE_WORDS: (0xFF1E - 0xFF00) / 2
  };

  static Command = {
    WRITE: 0x80,
    READ: 0x81,
    READ_STATUS_BYTE: 0x0F,
    START_SINGLE_MEASUREMENT_MODE: 0x1E,
    START_WOC_MODE: 0x2D,
    START_BURST_MODE: 0x3C,
    START_CONTINUOUS_MODE: 0x4B,
    START_IDLE_MODE: 0x5A,
    START_MEASUREMENT: 0x69,
    MEMORY_FETCH: 0x78,
    MEMORY_WRITE: 0x87,
    ADDRESSED_RESET: 0x96,
    GLOBAL_RESET: 0xA5,
    READ_MEASUREMENT: 0xB4,
    CLEAR_ERROR_FLAGS: 0xC3,
    CLEAR_RESET_FLAG: 0xD2
  };

  static Address = {
    REG_SW_VER1: 0xFF00,
    REG_SW_VER2: 0xFF02,
    REG_HW_VER1: 0xFF04,
    REG_HW_VER2: 0xFF06,
    REG0_CRC_STRT_CALC_CRC_ADDR: 0xFF08,
    REG1_N_AVG_ADC: 0xFF0A,
    REG2_PRS_TEMP_DATA_FILTER: 0xFF0C,
    REG3_WOC_MODE_CONFIG: 0xFF0E,
    REG4_WOC_BURST_CONT_MODE_CONFIG: 0xFF10,
    REG5_PRS_FILTER_CONFIG: 0xFF12,
    REG6_NTC_TEMP_FILTER_CONFIG: 0xFF14,
    REG7_CUST_CONF: 0xFF16,
    REG_RES_EEPROM_TEST_READ_EXEC: 0xFF18,
    REG_RES_EEPROM_LOCK_EXEC: 0xFF1A,
    REG_BA: 0xFF1C,
    REG1_PROTOCOL_ADDR: 0xFF1E,
    EE_CHECKSUM: 0x1000,
    EE_GEN_CTRL1: 0x1002,
    EE_N_AVG_CONF: 0x1004,
    EE_OUT_FILT_CONF: 0x1006,
    EE_WOC_VBE_NAVG_CONF: 0x1008,
    EE_WOC_BURST_CONT_CONF: 0x100A,
    EE_PRESS_LSM: 0x100C,
    EE_NTC_ALPF: 0x100E,
    EE_I2C_SPI_CONF: 0x1010,
    EE_TRIM4_PADC_RANGE1: 0x1012,
    EE_TRIM4_PADC_RANGE2: 0x1014,
    EE_TRIM5: 0x1016,
    EE_VSUP_CTRL: 0x1018,
    EE_P0: 0x101A,
    EE_A0: 0x101C,
    EE_A1: 0x101E,
    EE_A2: 0x1020,
    EE_A3: 0x1022,
    EE_B0: 0x1024,
    EE_B1: 0x1026,
    EE_B2: 0x1028,
    EE_B3: 0x102A,
    EE_C0: 0x102C,
    EE_C1: 0x102E,
    EE_TINT_T0: 0x1030,
    EE_TDEV_D0: 0x1032,
    EE_TDEV_D1: 0x1034,
    EE_TDEV_D2: 0x1036,
    EE_TMEMS_T0: 0x1038,
    EE_TMEMS_D0: 0x103A,
    EE_TMEMS_D1: 0x103C,
    EE_TMEMS_D2: 0x103E,
    EE_TMEMS_D3: 0x1040,
    EE_TMEMS_D4: 0x1042,
    EE_PSFT1_BASE: 0x1044,
    EE_PSFT1_LIMITS: 0x1046,
    EE_GLBL_ERR_MSK0_PSFT0: 0x1048,
    EE_GLBL_ERR_MASK1: 0x104A,
    EE_FILT_MASK0: 0x104C,
    EE_FILT_MASK1: 0x104E,
    EE_PATCH0_I: 0x1050,
    EE_PATCH0_A: 0x1052,
    EE_PATCH1_I: 0x1054,
    EE_PATCH1_A: 0x1056,
    EE_PATCH_AREA0: 0x1058,
    EE_PATCH_AREA1: 0x105A,
    EE_PATCH_AREA2: 0x105C,
    EE_PATCH_AREA3: 0x105E,
    EE_PATCH_AREA4: 0x1060,
    EE_PATCH_AREA5: 0x1062,
    EE_PATCH_AREA6: 0x1064,
    EE_P0_2: 0x1066,
    EE_A0_2: 0x1068,
    EE_A1_2: 0x106A,
    EE_A2_2: 0x106C,
    EE_A3_2: 0x106E,
    EE_B0_2: 0x1070,
    EE_B1_2: 0x1072,
    EE_B2_2: 0x1074,
    EE_B3_2: 0x1076,
    EE_C0_2: 0x1078,
    EE_C1_2: 0x107A,
    EE_N0: 0x107C,
    EE_N1: 0x107E,
    EE_N2: 0x1080,
    EE_N3: 0x1082,
    EE_SHA: 0x1084,
    EE_SHB: 0x1086,
    EE_SHC: 0x1088,
    EE_NTC_CAL0: 0x108A,
    EE_MLX_CHECKSUM: 0x108C,
    EE_TRIM0: 0x108E,
    EE_TRIM1: 0x1090,
    EE_TRIM2: 0x1092,
    EE_TRIM3: 0x1094,
    EE_DSP_CONF: 0x1096,
    EE_VIRT_REF_CONF: 0x1098,
    EE_AFE_DIG0: 0x109A,
    EE_AFE_DIG1: 0x109C,
    EE_MM0_HR: 0x109E,
    EE_MM1_HR: 0x10A0,
    EE_MM2_HR: 0x10A2,
    EE_MM3_HR: 0x10A4,
    EE_MM0_LR: 0x10A6,
    EE_MM1_LR: 0x10A8,
    EE_MM2_LR: 0x10AA,
    EE_MM3_LR: 0x10AC,
    EE_RP0: 0x10AE,
    EE_RP1: 0x10B0,
    EE_RP2: 0x10B2,
    EE_RP3: 0x10B4,
    EE_ANA_DIAG0: 0x10B6,
    EE_ANA_DIAG1: 0x10B8,
    EE_VZERO_THRD: 0x10BA,
    EE_VIRT_REF_TDIE: 0x10BC,
    EE_RPOLY_THRD: 0x10BE,
    EE_TRACEABILITY_CP: 0x10C0,
    EE_MLX_ID0_CP: 0x10C2,
    EE_MLX_ID1_CP: 0x10C4,
    EE_MLX_ID2_CP: 0x10C6,
    EE_TRACEABILITY: 0x10C8,
    EE_MLX_ID0: 0x10CA,
    EE_MLX_ID1: 0x10CC,
    EE_MLX_ID2: 0x10CE,
    CSMDMA_OFFSET: 0xFF1E
  };

  // Delay helper mirroring Python delay_ms
  async delayMs(ms) {
    await new Promise(res => setTimeout(res, ms));
  }

  async cmdCheck(cmd) {
    const tx = [MLX90835.Command.WRITE, cmd];
    try {
      const status = await this.transport.exchange(this.address, 1, tx);
      return status; // array of 1 byte
    } catch (e) {
      throw new Error('MLX90835 I2C cmdCheck error');
    }
  }

  async statusCheck() {
    const tx = [MLX90835.Command.READ, MLX90835.Command.READ_STATUS_BYTE];
    try {
      const status = await this.transport.exchange(this.address, 1, tx);
      return status;
    } catch (e) {
      throw new Error('MLX90835 I2C statusCheck error');
    }
  }

  async i2cGlobalReset() {
    const tx = [0x00, 0x06];
    try {
      return await this.transport.write(this.address, tx);
    } catch (e) {
      throw new Error('MLX90835 I2C global reset error');
    }
  }

  // Reads NrWord words (16-bit) and returns array of bytes [hi, lo, hi, lo, ...]
  async i2cReadWord(NrWord) {
    try {
      const responseWords = await this.transport.read(this.address, NrWord);
      const data = [];
      for (const w of responseWords) {
        const hi = (w >> 8) & 0xFF;
        const lo = w & 0xFF;
        data.push(hi, lo);
      }
      return data;
    } catch (e) {
      throw new Error('MLX90835 I2C read word error');
    }
  }

  // Reads NrBytes using exchange with READ command
  async i2cReadN(NrBytes) {
    try {
      return await this.transport.exchange(this.address, NrBytes, MLX90835.Command.READ);
    } catch (e) {
      throw new Error('MLX90835 I2C readN error');
    }
  }

  async memoryWrite(addr, dataWord) {
    const tx = [MLX90835.Command.WRITE, MLX90835.Command.MEMORY_WRITE];
    const addr_msb = (addr >> 8) & 0xFF;
    const addr_lsb = addr & 0xFF;
    const data_msb = (dataWord >> 8) & 0xFF;
    const data_lsb = dataWord & 0xFF;
    const payload = [addr_msb, addr_lsb, data_msb, data_lsb];
    const crc = MLX90835.calculate_crc(payload);
    const frame = tx.concat(payload, [crc]);
    try {
      const status = await this.transport.exchange(this.address, 1, frame);
      return status;
    } catch (e) {
      throw new Error('MLX90835 memoryWrite error');
    }
  }

  async i2cMemoryDump(addr, nWords) {
    const tx = [MLX90835.Command.WRITE, MLX90835.Command.MEMORY_WRITE];
    const memDumpAddr = MLX90835.Address.CSMDMA_OFFSET;
    const mem_addr_msb = (memDumpAddr >> 8) & 0xFF;
    const mem_addr_lsb = memDumpAddr & 0xFF;
    const mem_offset_msb = (addr >> 8) & 0xFF;
    const mem_offset_lsb = addr & 0xFF;
    const data = [mem_addr_msb, mem_addr_lsb, mem_offset_msb, mem_offset_lsb];
    const crc = MLX90835.calculate_crc(data);
    const frame = tx.concat(data, [crc]);
    try {
      // Expect back nWords*2 bytes
      const response = await this.transport.exchange(this.address, nWords * 2, frame);
      return response;
    } catch (e) {
      throw new Error('MLX90835 i2cMemoryDump error');
    }
  }

  async memoryRead(addr) {
    const tx = [MLX90835.Command.WRITE, MLX90835.Command.MEMORY_FETCH];
    const addr_msb = (addr >> 8) & 0xFF;
    const addr_lsb = addr & 0xFF;
    const payload = [addr_msb, addr_lsb];
    const crc = MLX90835.calculate_crc(payload);
    const frame = tx.concat(payload, [crc]);
    try {
      const first = await this.transport.exchange(this.address, 1, frame);
      const next = await this.transport.exchange(this.address, 4, MLX90835.Command.READ);
      return first.concat(next);
    } catch (e) {
      throw new Error('MLX90835 memoryRead error');
    }
  }

  async i2cWriteDwordEeprom(addr, dword) {
    const lsbWord = dword & 0xFFFF;
    const msbWord = (dword >> 16) & 0xFFFF;
    const res1 = await this.memoryWrite(addr, lsbWord);
    const res2 = await this.memoryWrite(addr + 2, msbWord);
    return res1.concat(res2);
  }

  async i2cChangeVmConfig(config) {
    const addresses = [
      MLX90835.Address.REG1_N_AVG_ADC,
      MLX90835.Address.REG2_PRS_TEMP_DATA_FILTER,
      MLX90835.Address.REG3_WOC_MODE_CONFIG,
      MLX90835.Address.REG4_WOC_BURST_CONT_MODE_CONFIG,
      MLX90835.Address.REG5_PRS_FILTER_CONFIG,
      MLX90835.Address.REG6_NTC_TEMP_FILTER_CONFIG
    ];

    for (const addr of addresses) {
      if (!(addr in config)) {
        const response = await this.memoryRead(addr);
        // Expect response like [status, status? , msb, lsb]
        if ((response[0] & 0x0A) !== 0) {
          const msb = response[2];
          const lsb = response[3];
          const value = (msb << 8) | lsb;
          config[addr] = value;
        } else {
          // failed
          return 1;
        }
      } else {
        await this.memoryWrite(addr, config[addr]);
      }
    }

    // Calculate checksum
    let crc_sum = 0;
    for (const addr of addresses) {
      crc_sum += ((config[addr] & 0xFF00) >> 8) + (config[addr] & 0x00FF);
    }
    crc_sum = crc_sum ^ 0xFFFF;
    await this.memoryWrite(MLX90835.Address.REG0_CRC_STRT_CALC_CRC_ADDR, crc_sum);
    return 0;
  }

  async custEepromDump() {
    const start = 0x1000;
    const end = 0x108C;
    const nWords = Math.floor((end - start) / 2);
    const response = await this.i2cMemoryDump(start, nWords);
    const readBytes = response.map(x => (typeof x === 'string' ? parseInt(x, 0) : x));
    const mem = {};
    for (let i = 0; i < Math.floor(readBytes.length / 2); i++) {
      const value = (readBytes[i * 2] << 8) | readBytes[i * 2 + 1];
      const address = start + 2 * i;
      mem[address] = value;
    }
    return mem;
  }

  async mlxEepromDump() {
    const start = 0x108C;
    const end = 0x10D0;
    const nWords = Math.floor((end - start) / 2);
    const response = await this.i2cMemoryDump(start, nWords);
    const readBytes = response.map(x => (typeof x === 'string' ? parseInt(x, 0) : x));
    const mem = {};
    for (let i = 0; i < Math.floor(readBytes.length / 2); i++) {
      const value = (readBytes[i * 2] << 8) | readBytes[i * 2 + 1];
      const address = start + 2 * i;
      mem[address] = value;
    }
    return mem;
  }

  recalculateMemChecksum(memory) {
    const keys = Object.keys(memory).map(k => parseInt(k, 10));
    const first = Math.min(...keys);
    delete memory[first];
    let crc_sum = 0;
    for (const [addrStr, value] of Object.entries(memory)) {
      crc_sum += ((value & 0xFF00) >> 8) + (value & 0x00FF);
    }
    crc_sum = crc_sum ^ 0xFFFF;
    memory[first] = crc_sum;
    return memory;
  }

  async programEeprom(newMemory, oldMemory) {
    const newKeys = Object.keys(newMemory).map(k => parseInt(k, 10));
    const first = Math.min(...newKeys);
    const last = Math.max(...newKeys);
    let response = [];
    response = response.concat(await this.memoryWrite(MLX90835.Address.REG_BA, 0xBA47));
    for (let address = first; address < last; address += 4) {
      const newDword = ((newMemory[address + 2] & 0xFFFF) << 16) | (newMemory[address] & 0xFFFF);
      const oldDword = ((oldMemory[address + 2] & 0xFFFF) << 16) | (oldMemory[address] & 0xFFFF);
      if (newDword !== oldDword) {
        const res = await this.i2cWriteDwordEeprom(address, newDword);
        response = response.concat(res);
        await this.delayMs(10);
      }
    }
    response = response.concat(await this.memoryWrite(MLX90835.Address.REG_BA, 0x0000));
    return response;
  }
}

