// MLX90835 SPI JavaScript driver
// Ported from .src/90835_python_api/source/mlx90835_spi.py
// Transport expectations (SPI device):
//  - chip_select_0() / chip_deselect_0()
//  - exchange(rxLen, txBytes)
//  - write_read(txBytes)
//  - read(nBytes)
//  - vdd_reset(ms)

export class SpiMLX90835 {
  constructor(spi) {
    this.spi = spi;
    // console.log('MLX90835 SPI initialized.');
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
      crc = SpiMLX90835.crc_lut[d];
    }
    return crc;
  }

  static Constant = {
    API_VER: 'API_VER_MLX90835 VERSION:1.0.0',
    DUMMY_SPI_TX: 0x00,
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
    CSMDMA_OFFSET: 0xFF1E,
  };

  async delayMs(ms) { await new Promise(r => setTimeout(r, ms)); }
  VDD_reset(ms = 1000) { this.spi.vdd_reset(ms); }

  async statusCheck() {
    this.spi.chip_select_0();
    try {
      const data_rx = await this.spi.exchange(1, [SpiMLX90835.Command.READ_STATUS_BYTE]);
      return data_rx;
    } catch (e) {
      throw new Error('SPI statusCheck error');
    } finally { this.spi.chip_deselect_0(); }
  }

  async cmdCheck(cmd) {
    this.spi.chip_select_0();
    try {
      const data_rx = await this.spi.exchange(1, [cmd]);
      return data_rx;
    } catch (e) { throw new Error('SPI cmdCheck error'); }
    finally { this.spi.chip_deselect_0(); }
  }

  async readN(NrBytes) {
    this.spi.chip_select_0();
    try {
      const data_rx = await this.spi.read(NrBytes);
      if (data_rx.length !== NrBytes) console.warn(`Expected ${NrBytes} bytes but received ${data_rx.length}.`);
      return data_rx;
    } catch (e) { throw new Error('SPI readN error'); }
    finally { this.spi.chip_deselect_0(); }
  }

  async spiExchangeFrame(data_tx) {
    this.spi.chip_select_0();
    const num_bytes = data_tx.length;
    try {
      const data_rx = await this.spi.write_read(data_tx);
      if (data_rx.length !== num_bytes) console.warn(`SPI exchange expected ${num_bytes} bytes but received ${data_rx.length}.`);
      return data_rx;
    } catch (e) { throw new Error('SPI exchange frame error'); }
    finally { this.spi.chip_deselect_0(); }
  }

  async startSingleMeas90835() {
    this.spi.chip_select_0();
    try {
      const response_list = await this.spi.exchange(1, SpiMLX90835.Command.START_SINGLE_MEASUREMENT_MODE);
      if (!response_list || response_list.length === 0) throw new Error('SPI start single measurement error');
      return response_list[0];
    } finally { this.spi.chip_deselect_0(); }
  }

  async spiAddressedReset90835() {
    this.spi.chip_select_0();
    try {
      const response_list = await this.spi.exchange(1, SpiMLX90835.Command.ADDRESSED_RESET);
      if (!response_list || response_list.length === 0) throw new Error('SPI addressed reset error');
      return response_list[0];
    } finally { this.spi.chip_deselect_0(); }
  }

  async spiGlobalReset90835() {
    this.spi.chip_select_0();
    try {
      const response_list = await this.spi.exchange(1, SpiMLX90835.Command.GLOBAL_RESET);
      if (!response_list || response_list.length === 0) throw new Error('SPI global reset error');
      return response_list[0];
    } finally { this.spi.chip_deselect_0(); }
  }

  async memoryRead(addr) {
    if (addr % 2) throw new Error('SPI addr odd error');
    const cmd = SpiMLX90835.Command.MEMORY_FETCH;
    const addr_msb = (addr >> 8) & 0xFF;
    const addr_lsb = addr & 0xFF;
    const data = [addr_msb, addr_lsb];
    const crc = SpiMLX90835.calculate_crc(data);
    const tx = [cmd, ...data, crc];
    this.spi.chip_select_0();
    try {
      const response_list = await this.spi.write_read(tx);
      if (!response_list || response_list.length !== tx.length) throw new Error('SPI memoryRead frame error');
      this.spi.chip_deselect_0();
      await this.delayMs(1);
      this.spi.chip_select_0();
      const follow = await this.spi.exchange(4, SpiMLX90835.Command.READ_MEASUREMENT);
      const command_check = response_list[1];
      return [command_check, follow];
    } finally { this.spi.chip_deselect_0(); }
  }

  async memoryWrite(addr, dataWord) {
    if (addr % 2) throw new Error('SPI addr odd error');
    const word_addr = addr >> 1;
    const cmd = SpiMLX90835.Command.MEMORY_WRITE | ((word_addr & 0x100) >> 8);
    const addr_msb = (addr >> 8) & 0xFF;
    const addr_lsb = addr & 0xFF;
    const data_msb = (dataWord >> 8) & 0xFF;
    const data_lsb = dataWord & 0xFF;
    const payload = [addr_msb, addr_lsb, data_msb, data_lsb];
    const crc = SpiMLX90835.calculate_crc(payload);
    const tx = [cmd, ...payload, crc];
    this.spi.chip_select_0();
    try {
      const response_list = await this.spiExchangeFrame(tx);
      if (!response_list || response_list.length !== tx.length) throw new Error('SPI memoryWrite frame error');
      const command_check = response_list[1];
      return command_check;
    } finally { this.spi.chip_deselect_0(); }
  }

  async spiReadMeas90835(N) {
    const tx = [SpiMLX90835.Command.READ_MEASUREMENT];
    if (N <= 0 || N > ((SpiMLX90835.Constant.TX_SIZE) - 3) / 2) throw new Error('SPI N size error');
    this.spi.chip_select_0();
    try {
      const rx = await this.spi.exchange(N + 2, tx);
      const data_rx = [];
      for (const i of rx) {
        const val = typeof i === 'string' ? parseInt(i, 16) : i;
        const low_byte = val & 0xFF;
        data_rx.push(low_byte);
      }
      return data_rx;
    } finally { this.spi.chip_deselect_0(); }
  }

  async spiWriteDwordEeprom90835(addr, dword) {
    const lsb = dword & 0xFFFF;
    const msb = (dword >> 16) & 0xFFFF;
    this.spi.chip_select_0();
    try {
      const r1 = await this.memoryWrite(addr, lsb);
      const r2 = await this.memoryWrite(addr + 2, msb);
      return [r1, r2];
    } finally { this.spi.chip_deselect_0(); }
  }

  async spiChangeVmConfig(config) {
    const addresses = [
      SpiMLX90835.Address.REG1_N_AVG_ADC,
      SpiMLX90835.Address.REG2_PRS_TEMP_DATA_FILTER,
      SpiMLX90835.Address.REG3_WOC_MODE_CONFIG,
      SpiMLX90835.Address.REG4_WOC_BURST_CONT_MODE_CONFIG,
      SpiMLX90835.Address.REG5_PRS_FILTER_CONFIG,
      SpiMLX90835.Address.REG6_NTC_TEMP_FILTER_CONFIG
    ];

    for (const addr of addresses) {
      if (!(addr in config)) {
        const response = await this.memoryRead(addr);
        if ((parseInt(response[1][0], 16) & 0x0A) !== 0) {
          const msb = parseInt(response[1][1], 16);
          const lsb = parseInt(response[1][2], 16);
          const value = (msb << 8) | lsb;
          config[addr] = value;
        } else {
          return 1;
        }
      } else {
        await this.memoryWrite(addr, config[addr]);
      }
    }

    let crc_sum = 0;
    for (const addr of addresses) {
      crc_sum += ((config[addr] & 0xFF00) >> 8) + (config[addr] & 0x00FF);
    }
    crc_sum = crc_sum ^ 0xFFFF;

    await this.memoryWrite(SpiMLX90835.Address.REG0_CRC_STRT_CALC_CRC_ADDR, crc_sum);
    return 0;
  }

  async spiMemoryDump(addr, n) {
    const tx = [SpiMLX90835.Command.MEMORY_WRITE];
    const memDumpAddr = SpiMLX90835.Address.CSMDMA_OFFSET;
    const mem_addr_msb = (memDumpAddr >> 8) & 0xFF;
    const mem_addr_lsb = memDumpAddr & 0xFF;
    const mem_offset_msb = (addr >> 8) & 0xFF;
    const mem_offset_lsb = addr & 0xFF;
    const data = [mem_addr_msb, mem_addr_lsb, mem_offset_msb, mem_offset_lsb];
    const crc = SpiMLX90835.calculate_crc(data);
    const frame = tx.concat(data, [crc]);
    this.spi.chip_select_0();
    try {
      const response = await this.spi.exchange(2 * n + 6, frame);
      this.spi.chip_deselect_0();
      const start_index = response.index('0x4B');
      if (response[start_index + 1] === '0x1D') {
        return response.slice(start_index + 2, start_index + 2 + 2 * n);
      }
      throw new Error('Invalid SPI response');
    } finally { this.spi.chip_deselect_0(); }
  }

  async custEepromDump() {
    const start = 0x1000;
    const end = 0x108C;
    const num_words = Math.floor((end - start) / 2);
    const response = await this.spiMemoryDump(start, num_words);
    const read_bytes = response.map(x => (typeof x === 'string' ? parseInt(x, 0) : x));
    const cust_eeprom = {};
    for (let i = 0; i < Math.floor(read_bytes.length / 2); i++) {
      const value = (read_bytes[i * 2] << 8) | read_bytes[i * 2 + 1];
      const address = start + 2 * i;
      cust_eeprom[address] = value;
    }
    return cust_eeprom;
  }

  async mlxEepromDump() {
    const start = 0x108C;
    const end = 0x10D0;
    const num_words = Math.floor((end - start) / 2);
    const response = await this.spiMemoryDump(start, num_words);
    const read_bytes = response.map(x => (typeof x === 'string' ? parseInt(x, 0) : x));
    const mlx_eeprom = {};
    for (let i = 0; i < Math.floor(read_bytes.length / 2); i++) {
      const value = (read_bytes[i * 2] << 8) | read_bytes[i * 2 + 1];
      const address = start + 2 * i;
      mlx_eeprom[address] = value;
    }
    return mlx_eeprom;
  }

  recalculateMemChecksum(memory) {
    const keys = Object.keys(memory).map(k => parseInt(k, 10));
    const first = Math.min(...keys);
    delete memory[first];
    let crc_sum = 0;
    for (const value of Object.values(memory)) {
      crc_sum += ((value & 0xFF00) >> 8) + (value & 0x00FF);
    }
    crc_sum = crc_sum ^ 0xFFFF;
    memory[first] = crc_sum;
    return memory;
  }

  async programEeprom(new_memory, old_memory) {
    let response = [];
    const first_address = Math.min(...Object.keys(new_memory).map(k => parseInt(k, 10)));
    const last_address = Math.max(...Object.keys(new_memory).map(k => parseInt(k, 10)));
    response = response.concat(await this.memoryWrite(SpiMLX90835.Address.REG_BA, 0xBA47));
    for (let address = first_address; address < last_address; address += 4) {
      const new_dword = ((new_memory[address + 2] & 0xFFFF) << 16) | (new_memory[address] & 0xFFFF);
      const old_dword = ((old_memory[address + 2] & 0xFFFF) << 16) | (old_memory[address] & 0xFFFF);
      if (new_dword !== old_dword) {
        const resp = await this.spiWriteDwordEeprom90835(address, new_dword);
        response = response.concat(resp);
        await this.delayMs(10);
      }
    }
    response = response.concat(await this.memoryWrite(SpiMLX90835.Address.REG_BA, 0x0000));
    return response;
  }
}
