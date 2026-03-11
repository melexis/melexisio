// MLX90835 SPI examples in JavaScript
// Ported from .src/90835_python_api/mlx90835_spi_examples.py
// This file demonstrates usage; it expects a SPI transport compatible with the SpiMLX90835 driver.

// Placeholder imports: adapt to your actual JS modules.
// import { MelexisIOcomm } from './melexis_io.js';
// import { SpiMlxCommDevice } from './mlx_spi_comm.js';
// import { SpiMLX90835 } from './mlx90835_spi.js';

async function main() {
  try {
    // Initialize IO layer (adapt as needed)
    // const mlxIO = new MelexisIOcomm({ comm: null, vid: null, pid: null, br: 30000 });

    // SPI device on channel 1, cs_pin 0 (RX). Adjust to your wiring.
    // const spiDev = new SpiMlxCommDevice(mlxIO, { channel: 1, cs_pin: 0 });

    // Create sensor driver
    // const sensor = new SpiMLX90835(spiDev);

    // Example command flow similar to Python:
    // await sensor.cmdCheck(SpiMLX90835.Command.CLEAR_ERROR_FLAGS);
    // await sensor.cmdCheck(SpiMLX90835.Command.CLEAR_RESET_FLAG);

    // const status1 = await sensor.statusCheck();
    // console.log('Status:', status1);

    // await sensor.cmdCheck(SpiMLX90835.Command.START_IDLE_MODE);
    // console.log('Idle mode set');

    // console.log('Change config in VM');
    // await sensor.spiChangeVmConfig({ [SpiMLX90835.Address.REG2_PRS_TEMP_DATA_FILTER]: 0x61EB });

    // console.log('Read back memory at 0x1000');
    // const readBack = await sensor.memoryRead(0x1000);
    // console.log('Read back written memory:', readBack);

    // console.log('Full customer EEPROM dump');
    // const custImg = await sensor.custEepromDump();
    // Object.entries(custImg).forEach(([k, v]) => console.log(`${Number(k).toString(16).padStart(4,'0')}:${v.toString(16).padStart(4,'0')}`));

    // const custTemp = { ...custImg };
    // custTemp[SpiMLX90835.Address.EE_A0_2] = 0xBBBB;
    // const updated = sensor.recalculateMemChecksum(custTemp);

    // const respProg = await sensor.programEeprom(updated, custImg);
    // console.log('EEPROM program response:', respProg);

    // await sensor.cmdCheck(SpiMLX90835.Command.START_CONTINUOUS_MODE);
    // await new Promise(r => setTimeout(r, 10));
    // const status2 = await sensor.statusCheck();
    // console.log('Status after continuous mode:', status2);

    // console.log('Read 8 bytes of measurement');
    // const meas = await sensor.spiReadMeas90835(8);
    // console.log('Measurement:', meas);

    console.log('mlx90835_spi_examples.js is a usage scaffold. Wire transports and driver to run.');
  } catch (e) {
    console.error('An error occurred:', e);
  }
}

// If run directly in a module context, execute main.
// Remove or adapt depending on your bundler/runtime.
main();
