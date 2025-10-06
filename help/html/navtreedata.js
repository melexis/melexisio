/*
 @licstart  The following is the entire license notice for the JavaScript code in this file.

 The MIT License (MIT)

 Copyright (C) 1997-2020 by Dimitri van Heesch

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 and associated documentation files (the "Software"), to deal in the Software without restriction,
 including without limitation the rights to use, copy, modify, merge, publish, distribute,
 sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or
 substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

 @licend  The above is the entire license notice for the JavaScript code in this file
*/
var NAVTREE =
[
  [ "MelexisIO SCPI Commands", "index.html", [
    [ "SCPI Command Documentation Index", "index.html", null ],
    [ "ADC SCPI Commands", "d9/da6/md_SCPI_commands_adc.html", [
      [ "Overview", "d9/da6/md_SCPI_commands_adc.html#autotoc_md6", null ],
      [ "Supported Commands", "d9/da6/md_SCPI_commands_adc.html#autotoc_md7", null ],
      [ "Command Details", "d9/da6/md_SCPI_commands_adc.html#autotoc_md8", [
        [ "Initialization", "d9/da6/md_SCPI_commands_adc.html#autotoc_md9", null ],
        [ "Set Sample Time", "d9/da6/md_SCPI_commands_adc.html#autotoc_md10", null ],
        [ "Query Sample Time", "d9/da6/md_SCPI_commands_adc.html#autotoc_md11", null ],
        [ "Read ADC Value", "d9/da6/md_SCPI_commands_adc.html#autotoc_md12", null ]
      ] ],
      [ "Handler Functions", "d9/da6/md_SCPI_commands_adc.html#autotoc_md13", null ],
      [ "Examples", "d9/da6/md_SCPI_commands_adc.html#autotoc_md14", [
        [ "Initialize ADC Pin", "d9/da6/md_SCPI_commands_adc.html#autotoc_md15", null ],
        [ "Set Sample Time", "d9/da6/md_SCPI_commands_adc.html#autotoc_md16", null ],
        [ "Query Sample Time", "d9/da6/md_SCPI_commands_adc.html#autotoc_md17", null ],
        [ "Read ADC Value", "d9/da6/md_SCPI_commands_adc.html#autotoc_md18", null ],
        [ "Error Example (Invalid Pin)", "d9/da6/md_SCPI_commands_adc.html#autotoc_md19", null ]
      ] ],
      [ "Notes", "d9/da6/md_SCPI_commands_adc.html#autotoc_md20", null ]
    ] ],
    [ "Application SCPI Commands", "dc/d69/md_SCPI_commands_application.html", [
      [ "Overview", "dc/d69/md_SCPI_commands_application.html#autotoc_md22", null ],
      [ "Supported Commands", "dc/d69/md_SCPI_commands_application.html#autotoc_md23", null ],
      [ "Command Details", "dc/d69/md_SCPI_commands_application.html#autotoc_md24", [
        [ "System Information", "dc/d69/md_SCPI_commands_application.html#autotoc_md25", null ],
        [ "Help", "dc/d69/md_SCPI_commands_application.html#autotoc_md26", null ],
        [ "Time and Date", "dc/d69/md_SCPI_commands_application.html#autotoc_md27", null ],
        [ "Benchmark", "dc/d69/md_SCPI_commands_application.html#autotoc_md28", null ],
        [ "Bootloader", "dc/d69/md_SCPI_commands_application.html#autotoc_md29", null ],
        [ "Pins Layout", "dc/d69/md_SCPI_commands_application.html#autotoc_md30", null ]
      ] ],
      [ "Examples", "dc/d69/md_SCPI_commands_application.html#autotoc_md31", [
        [ "Get System Information", "dc/d69/md_SCPI_commands_application.html#autotoc_md32", null ],
        [ "List All Commands", "dc/d69/md_SCPI_commands_application.html#autotoc_md33", null ],
        [ "Get System Time (RTC enabled)", "dc/d69/md_SCPI_commands_application.html#autotoc_md34", null ],
        [ "Set System Time (RTC enabled)", "dc/d69/md_SCPI_commands_application.html#autotoc_md35", null ],
        [ "Run Benchmark", "dc/d69/md_SCPI_commands_application.html#autotoc_md36", null ],
        [ "Error Example (Invalid Command)", "dc/d69/md_SCPI_commands_application.html#autotoc_md37", null ]
      ] ],
      [ "Notes", "dc/d69/md_SCPI_commands_application.html#autotoc_md38", null ]
    ] ],
    [ "EEPROM SCPI Command Reference", "d2/d5d/md_SCPI_commands_eeprom.html", [
      [ "1. Binary Record Layout", "d2/d5d/md_SCPI_commands_eeprom.html#autotoc_md41", null ],
      [ "2. Command Summary", "d2/d5d/md_SCPI_commands_eeprom.html#autotoc_md43", null ],
      [ "3. INIT Behavior", "d2/d5d/md_SCPI_commands_eeprom.html#autotoc_md45", null ],
      [ "4. SAVE Behavior", "d2/d5d/md_SCPI_commands_eeprom.html#autotoc_md47", null ],
      [ "5. RECords? Output", "d2/d5d/md_SCPI_commands_eeprom.html#autotoc_md49", null ],
      [ "6. GET / SET Formats", "d2/d5d/md_SCPI_commands_eeprom.html#autotoc_md51", null ],
      [ "7. Deletion", "d2/d5d/md_SCPI_commands_eeprom.html#autotoc_md53", null ],
      [ "8. Edge Cases & Limits", "d2/d5d/md_SCPI_commands_eeprom.html#autotoc_md55", null ],
      [ "9. Typical Session", "d2/d5d/md_SCPI_commands_eeprom.html#autotoc_md57", null ],
      [ "10. Return Codes (Internal)", "d2/d5d/md_SCPI_commands_eeprom.html#autotoc_md59", null ],
      [ "11. Verbosity", "d2/d5d/md_SCPI_commands_eeprom.html#autotoc_md61", null ]
    ] ],
    [ "GPIO SCPI Commands", "d2/d84/md_SCPI_commands_gpio.html", [
      [ "Overview", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md64", null ],
      [ "Supported Commands", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md65", [
        [ "Initialization", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md66", null ],
        [ "Deinitialization", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md67", null ],
        [ "Output (Write)", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md68", null ],
        [ "Input (Read)", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md69", null ]
      ] ],
      [ "Command Details", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md70", null ],
      [ "Handler Function", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md71", null ],
      [ "Example Usage", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md72", null ],
      [ "Examples", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md73", [
        [ "Initialize Pin as Output", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md74", null ],
        [ "Set Pin Output High", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md75", null ],
        [ "Read Pin Input", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md76", null ],
        [ "Deinitialize Pin", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md77", null ],
        [ "Error Example (Invalid Pin Name)", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md78", null ]
      ] ],
      [ "Notes", "d2/d84/md_SCPI_commands_gpio.html#autotoc_md79", null ]
    ] ],
    [ "I2C SCPI Commands", "d1/d53/md_SCPI_commands_i2c.html", [
      [ "Overview", "d1/d53/md_SCPI_commands_i2c.html#autotoc_md81", null ],
      [ "Supported Commands", "d1/d53/md_SCPI_commands_i2c.html#autotoc_md82", [
        [ "FMPI2C (I2C1)", "d1/d53/md_SCPI_commands_i2c.html#autotoc_md83", null ],
        [ "I2C2", "d1/d53/md_SCPI_commands_i2c.html#autotoc_md84", null ]
      ] ],
      [ "Command Details", "d1/d53/md_SCPI_commands_i2c.html#autotoc_md85", null ],
      [ "Examples", "d1/d53/md_SCPI_commands_i2c.html#autotoc_md86", [
        [ "Initialize FMPI2C", "d1/d53/md_SCPI_commands_i2c.html#autotoc_md87", null ],
        [ "Set I2C Frequency", "d1/d53/md_SCPI_commands_i2c.html#autotoc_md88", null ],
        [ "Read Device Memory", "d1/d53/md_SCPI_commands_i2c.html#autotoc_md89", null ],
        [ "Write Device Memory", "d1/d53/md_SCPI_commands_i2c.html#autotoc_md90", null ],
        [ "Error Example (Invalid Address)", "d1/d53/md_SCPI_commands_i2c.html#autotoc_md91", null ]
      ] ],
      [ "Notes", "d1/d53/md_SCPI_commands_i2c.html#autotoc_md92", null ]
    ] ],
    [ "PWM SCPI Commands", "d9/dbc/md_SCPI_commands_pwm.html", [
      [ "Overview", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md94", null ],
      [ "Supported Commands", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md95", [
        [ "DMA/IRQ/Clock/Deinit", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md96", null ],
        [ "PWM/Frequency/Output (A0-A3, SDA, SCL)", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md97", null ],
        [ "Example for Other Pins", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md98", null ],
        [ "Connector/Other Pins (Commented/Planned)", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md99", null ]
      ] ],
      [ "Command Details", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md100", null ],
      [ "Handler Functions", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md101", null ],
      [ "Example Usage", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md102", null ],
      [ "Examples", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md103", [
        [ "Initialize PWM Input", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md104", null ],
        [ "Read PWM Value", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md105", null ],
        [ "Set PWM Output Frequency", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md106", null ],
        [ "Read Frequency", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md107", null ],
        [ "Deinitialize PWM", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md108", null ],
        [ "Error Example (Invalid Pin)", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md109", null ]
      ] ],
      [ "Notes", "d9/dbc/md_SCPI_commands_pwm.html#autotoc_md110", null ]
    ] ],
    [ "IEEE Mandated Commands", "d9/dd0/md_SCPI_commands_scpi.html", [
      [ "Overview", "d9/dd0/md_SCPI_commands_scpi.html#autotoc_md112", null ],
      [ "Supported Commands", "d9/dd0/md_SCPI_commands_scpi.html#autotoc_md113", [
        [ "IEEE Mandated Commands (SCPI std V1999.0 4.1.1)", "d9/dd0/md_SCPI_commands_scpi.html#autotoc_md114", null ],
        [ "Required SCPI Commands (SCPI std V1999.0 4.2.1)", "d9/dd0/md_SCPI_commands_scpi.html#autotoc_md115", null ],
        [ "Custom/Meta", "d9/dd0/md_SCPI_commands_scpi.html#autotoc_md116", null ]
      ] ],
      [ "Handler Functions", "d9/dd0/md_SCPI_commands_scpi.html#autotoc_md117", null ],
      [ "Examples", "d9/dd0/md_SCPI_commands_scpi.html#autotoc_md118", [
        [ "Query Device Identification", "d9/dd0/md_SCPI_commands_scpi.html#autotoc_md119", null ],
        [ "Reset Device", "d9/dd0/md_SCPI_commands_scpi.html#autotoc_md120", null ],
        [ "Query System Error", "d9/dd0/md_SCPI_commands_scpi.html#autotoc_md121", null ],
        [ "Query SCPI Version", "d9/dd0/md_SCPI_commands_scpi.html#autotoc_md122", null ],
        [ "Error Example (Unknown Command)", "d9/dd0/md_SCPI_commands_scpi.html#autotoc_md123", null ]
      ] ],
      [ "Notes", "d9/dd0/md_SCPI_commands_scpi.html#autotoc_md124", null ]
    ] ],
    [ "SPI SCPI Commands", "d8/d48/md_SCPI_commands_spi.html", [
      [ "Overview", "d8/d48/md_SCPI_commands_spi.html#autotoc_md126", null ],
      [ "Supported Commands", "d8/d48/md_SCPI_commands_spi.html#autotoc_md127", [
        [ "Vdd Control", "d8/d48/md_SCPI_commands_spi.html#autotoc_md128", null ],
        [ "Buffer Direction", "d8/d48/md_SCPI_commands_spi.html#autotoc_md129", null ],
        [ "SPI1 (Connector X2)", "d8/d48/md_SCPI_commands_spi.html#autotoc_md130", null ],
        [ "SPI2 (Header H5)", "d8/d48/md_SCPI_commands_spi.html#autotoc_md131", null ]
      ] ],
      [ "Command Details", "d8/d48/md_SCPI_commands_spi.html#autotoc_md132", null ],
      [ "Examples", "d8/d48/md_SCPI_commands_spi.html#autotoc_md133", [
        [ "Initialize SPI1", "d8/d48/md_SCPI_commands_spi.html#autotoc_md134", null ],
        [ "Set SPI1 Prescaler", "d8/d48/md_SCPI_commands_spi.html#autotoc_md135", null ],
        [ "Write Data to SPI1", "d8/d48/md_SCPI_commands_spi.html#autotoc_md136", null ],
        [ "Read Data from SPI1", "d8/d48/md_SCPI_commands_spi.html#autotoc_md137", null ],
        [ "Exchange Data with SPI1 Slave 0", "d8/d48/md_SCPI_commands_spi.html#autotoc_md138", null ],
        [ "Error Example (Invalid Prescaler)", "d8/d48/md_SCPI_commands_spi.html#autotoc_md139", null ]
      ] ],
      [ "Notes", "d8/d48/md_SCPI_commands_spi.html#autotoc_md140", null ]
    ] ],
    [ "UART SCPI Commands", "d8/de7/md_SCPI_commands_uart.html", [
      [ "Overview", "d8/de7/md_SCPI_commands_uart.html#autotoc_md142", null ],
      [ "Supported Commands", "d8/de7/md_SCPI_commands_uart.html#autotoc_md143", [
        [ "Information", "d8/de7/md_SCPI_commands_uart.html#autotoc_md144", null ],
        [ "Initialization/Deinitialization", "d8/de7/md_SCPI_commands_uart.html#autotoc_md145", null ],
        [ "UART3 Configuration", "d8/de7/md_SCPI_commands_uart.html#autotoc_md146", null ],
        [ "UART4 Configuration", "d8/de7/md_SCPI_commands_uart.html#autotoc_md147", null ],
        [ "UART Data Transfer", "d8/de7/md_SCPI_commands_uart.html#autotoc_md148", null ]
      ] ],
      [ "Command Details", "d8/de7/md_SCPI_commands_uart.html#autotoc_md149", null ],
      [ "Examples", "d8/de7/md_SCPI_commands_uart.html#autotoc_md150", [
        [ "Initialize UART3", "d8/de7/md_SCPI_commands_uart.html#autotoc_md151", null ],
        [ "Set UART3 Baud Rate", "d8/de7/md_SCPI_commands_uart.html#autotoc_md152", null ],
        [ "Query UART3 Baud Rate", "d8/de7/md_SCPI_commands_uart.html#autotoc_md153", null ],
        [ "Write Data to UART3", "d8/de7/md_SCPI_commands_uart.html#autotoc_md154", null ],
        [ "Read Data from UART3", "d8/de7/md_SCPI_commands_uart.html#autotoc_md155", null ],
        [ "Error Example (Invalid Baud Rate)", "d8/de7/md_SCPI_commands_uart.html#autotoc_md156", null ]
      ] ],
      [ "Notes", "d8/de7/md_SCPI_commands_uart.html#autotoc_md157", null ]
    ] ],
    [ "I2C Stick compatiblity commands Reference", "db/dc8/md_web_commands_eeprom.html", [
      [ "1. Command Summary", "db/dc8/md_web_commands_eeprom.html#autotoc_md159", null ],
      [ "2. Measurement Formats", "db/dc8/md_web_commands_eeprom.html#autotoc_md160", null ],
      [ "3. Mode Control", "db/dc8/md_web_commands_eeprom.html#autotoc_md161", null ],
      [ "4. Planned EEPROM (EE) Subcommands", "db/dc8/md_web_commands_eeprom.html#autotoc_md162", null ],
      [ "5. Error Handling", "db/dc8/md_web_commands_eeprom.html#autotoc_md163", null ],
      [ "6. Concurrency", "db/dc8/md_web_commands_eeprom.html#autotoc_md164", null ],
      [ "7. Implementation Notes", "db/dc8/md_web_commands_eeprom.html#autotoc_md165", null ],
      [ "8. Roadmap Suggestions", "db/dc8/md_web_commands_eeprom.html#autotoc_md166", null ]
    ] ]
  ] ]
];

var NAVTREEINDEX =
[
"d1/d53/md_SCPI_commands_i2c.html"
];

var SYNCONMSG = 'click to disable panel synchronisation';
var SYNCOFFMSG = 'click to enable panel synchronisation';