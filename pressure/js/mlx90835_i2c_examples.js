// MLX90835 I2C examples in JavaScript
// Ported from .src/90835_python_api/mlx90835_i2c_examples.py
// This file demonstrates usage; it expects an I2C transport compatible with the MLX90835 driver.

// Placeholder imports: adapt to your actual JS modules.
// import { MLX90835 } from './mlx90835_i2c.js';
// import { I2cMlxCommDevice } from './mlx_i2c_comm.js';

async function main() {
  try {
    // Initialize I2C comm layer (adapt as needed)
    // const i2cDev = new I2cMlxCommDevice({ bus: 1 });

    // Create sensor driver
    // const sensor = new MLX90835(i2cDev, { address: 0x33 });

    // Example command flow similar to Python:
    // await sensor.cmdCheck(MLX90835.Command.CLEAR_ERROR_FLAGS);
    // await sensor.cmdCheck(MLX90835.Command.CLEAR_RESET_FLAG);

    // const status1 = await sensor.statusCheck();
    // console.log('Status:', status1);

    // await sensor.cmdCheck(MLX90835.Command.START_IDLE_MODE);
    // console.log('Idle mode set');

    // console.log('Change config in VM');
    // await sensor.i2cChangeVmConfig({ [MLX90835.Address.REG2_PRS_TEMP_DATA_FILTER]: 0x61EB });

    // console.log('Read back memory at 0x1000');
    // const readBack = await sensor.memoryRead(0x1000);
    // console.log('Read back written memory:', readBack);

    // console.log('Full customer EEPROM dump');
    // const custImg = await sensor.custEepromDump();
    // Object.entries(custImg).forEach(([k, v]) => console.log(`${Number(k).toString(16).padStart(4,'0')}:${v.toString(16).padStart(4,'0')}`));

    // const custTemp = { ...custImg };
    // custTemp[MLX90835.Address.EE_A0_2] = 0xBBBB;
    // const updated = sensor.recalculateMemChecksum(custTemp);

    // const respProg = await sensor.programEeprom(updated, custImg);
    // console.log('EEPROM program response:', respProg);

    // await sensor.cmdCheck(MLX90835.Command.START_CONTINUOUS_MODE);
    // await new Promise(r => setTimeout(r, 10));
    // const status2 = await sensor.statusCheck();
    // console.log('Status after continuous mode:', status2);

    console.log('mlx90835_i2c_examples.js is a usage scaffold. Wire transports and driver to run.');
  } catch (e) {
    console.error('An error occurred:', e);
  }
}

// If run directly in a module context, execute main.
main();
