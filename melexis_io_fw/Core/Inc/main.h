/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.h
  * @brief          : Header for main.c file.
  *                   This file contains the common defines of the application.
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2025 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */

/* Define to prevent recursive inclusion -------------------------------------*/
#ifndef __MAIN_H
#define __MAIN_H

#ifdef __cplusplus
extern "C" {
#endif

/* Includes ------------------------------------------------------------------*/
#include "stm32f4xx_hal.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */

/* USER CODE END Includes */

/* Exported types ------------------------------------------------------------*/
/* USER CODE BEGIN ET */

/* USER CODE END ET */

/* Exported constants --------------------------------------------------------*/
/* USER CODE BEGIN EC */

/* USER CODE END EC */

/* Exported macro ------------------------------------------------------------*/
/* USER CODE BEGIN EM */

/* USER CODE END EM */

/* Exported functions prototypes ---------------------------------------------*/
void Error_Handler(void);

/* USER CODE BEGIN EFP */

/* USER CODE END EFP */

/* Private defines -----------------------------------------------------------*/
#define I2C2_SDA_Pin GPIO_PIN_12
#define I2C2_SDA_GPIO_Port GPIOC
#define DIR_4_Pin GPIO_PIN_4
#define DIR_4_GPIO_Port GPIOD
#define SYS_SWO_Pin GPIO_PIN_3
#define SYS_SWO_GPIO_Port GPIOB
#define SPI_MOSI_Pin GPIO_PIN_5
#define SPI_MOSI_GPIO_Port GPIOB
#define PS_EN_Pin GPIO_PIN_4
#define PS_EN_GPIO_Port GPIOE
#define DIR_1_Pin GPIO_PIN_0
#define DIR_1_GPIO_Port GPIOD
#define DIR_5_Pin GPIO_PIN_6
#define DIR_5_GPIO_Port GPIOD
#define USB_N_Pin GPIO_PIN_11
#define USB_N_GPIO_Port GPIOA
#define SYS_SWCLK_Pin GPIO_PIN_14
#define SYS_SWCLK_GPIO_Port GPIOA
#define DIR_2_Pin GPIO_PIN_1
#define DIR_2_GPIO_Port GPIOD
#define BOOT_Pin GPIO_PIN_13
#define BOOT_GPIO_Port GPIOC
#define SYS_SWDIO_Pin GPIO_PIN_13
#define SYS_SWDIO_GPIO_Port GPIOA
#define DIR_3_Pin GPIO_PIN_2
#define DIR_3_GPIO_Port GPIOD
#define USB_P_Pin GPIO_PIN_12
#define USB_P_GPIO_Port GPIOA
#define UART_VCP_RX_Pin GPIO_PIN_3
#define UART_VCP_RX_GPIO_Port GPIOA
#define UART_VCP_TX_Pin GPIO_PIN_2
#define UART_VCP_TX_GPIO_Port GPIOA
#define SPI2_MISO_Pin GPIO_PIN_2
#define SPI2_MISO_GPIO_Port GPIOC
#define I2C_SCL_Pin GPIO_PIN_6
#define I2C_SCL_GPIO_Port GPIOC
#define I2C_SDA_Pin GPIO_PIN_7
#define I2C_SDA_GPIO_Port GPIOC
#define SPI2_CLK_Pin GPIO_PIN_9
#define SPI2_CLK_GPIO_Port GPIOA
#define CS1_Pin GPIO_PIN_0
#define CS1_GPIO_Port GPIOB
#define SPI_CLK_Pin GPIO_PIN_5
#define SPI_CLK_GPIO_Port GPIOA
#define SPI2_MOSI_Pin GPIO_PIN_3
#define SPI2_MOSI_GPIO_Port GPIOC
#define MCU_LED_G_Pin GPIO_PIN_9
#define MCU_LED_G_GPIO_Port GPIOE
#define SPI_MISO_Pin GPIO_PIN_6
#define SPI_MISO_GPIO_Port GPIOA
#define PIN_A1_Pin GPIO_PIN_1
#define PIN_A1_GPIO_Port GPIOA
#define I2C2_SCL_Pin GPIO_PIN_10
#define I2C2_SCL_GPIO_Port GPIOB
#define MCU_LED_B_Pin GPIO_PIN_8
#define MCU_LED_B_GPIO_Port GPIOE
#define SPI2_CS1_Pin GPIO_PIN_1
#define SPI2_CS1_GPIO_Port GPIOB
#define CS0_Pin GPIO_PIN_4
#define CS0_GPIO_Port GPIOA
#define SPI2_CS0_Pin GPIO_PIN_14
#define SPI2_CS0_GPIO_Port GPIOB
#define MCU_LED_R_Pin GPIO_PIN_10
#define MCU_LED_R_GPIO_Port GPIOE
#define PS_SEL_Pin GPIO_PIN_7
#define PS_SEL_GPIO_Port GPIOE
#define PIN_A0_Pin GPIO_PIN_0
#define PIN_A0_GPIO_Port GPIOA

/* USER CODE BEGIN Private defines */

/* USER CODE END Private defines */

#ifdef __cplusplus
}
#endif

#endif /* __MAIN_H */
