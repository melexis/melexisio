package com.melexisio.terminal

import android.app.PendingIntent
import android.content.*
import android.hardware.usb.*
import android.os.Build
import kotlinx.coroutines.*
import java.nio.ByteBuffer

/**
 * Minimal USB CDC (ACM) manager: enumerate, request permission, open, set line coding, read/write.
 */
class UsbCdcManager(
    private val context: Context,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
) {
    private val usb by lazy { context.getSystemService(Context.USB_SERVICE) as UsbManager }
    private var device: UsbDevice? = null
    private var conn: UsbDeviceConnection? = null
    private var inEp: UsbEndpoint? = null
    private var outEp: UsbEndpoint? = null
    private var readJob: Job? = null
    var onData: ((ByteArray) -> Unit)? = null
    var onStatus: ((String) -> Unit)? = null

    private val actionPermission = context.packageName + ".USB_PERMISSION"

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, intent: Intent?) {
            when (intent?.action) {
                actionPermission -> {
                    val dev: UsbDevice? = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false) && dev != null) {
                        openDevice(dev)
                    } else onStatus?.invoke("Permission denied")
                }
                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    val dev: UsbDevice? = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                    if (dev != null && dev == device) close()
                }
            }
        }
    }

    fun register() {
        val f = IntentFilter().apply {
            addAction(actionPermission)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
        }
        context.registerReceiver(receiver, f)
    }

    fun unregister() { runCatching { context.unregisterReceiver(receiver) } }

    fun listCdcDevices(): List<UsbDevice> = usb.deviceList.values.filter { d ->
        (0 until d.interfaceCount).any { idx ->
            val intf = d.getInterface(idx)
            intf.interfaceClass == UsbConstants.USB_CLASS_COMM ||
                (intf.interfaceClass == UsbConstants.USB_CLASS_VENDOR_SPEC && (intf.name?.contains("CDC", true) == true))
        }
    }

    fun request(dev: UsbDevice) {
        val flags = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
        val pi = PendingIntent.getBroadcast(context, 0, Intent(actionPermission), flags)
        usb.requestPermission(dev, pi)
    }

    private fun openDevice(dev: UsbDevice) {
        val commIntf = (0 until dev.interfaceCount).map { dev.getInterface(it) }
            .firstOrNull { it.interfaceClass == UsbConstants.USB_CLASS_COMM }
        val dataIntf = (0 until dev.interfaceCount).map { dev.getInterface(it) }
            .firstOrNull { it.interfaceClass == UsbConstants.USB_CLASS_CDC_DATA } ?: run {
            onStatus?.invoke("CDC DATA interface not found")
            return
        }
        val connection = usb.openDevice(dev) ?: run {
            onStatus?.invoke("Open failed")
            return
        }
        if (commIntf != null) connection.claimInterface(commIntf, true)
        connection.claimInterface(dataIntf, true)

        // Endpoints
        var epIn: UsbEndpoint? = null
        var epOut: UsbEndpoint? = null
        for (i in 0 until dataIntf.endpointCount) {
            val ep = dataIntf.getEndpoint(i)
            if (ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                if (ep.direction == UsbConstants.USB_DIR_IN) epIn = ep else if (ep.direction == UsbConstants.USB_DIR_OUT) epOut = ep
            }
        }
        if (epIn == null || epOut == null) {
            onStatus?.invoke("Bulk endpoints missing")
            connection.close()
            return
        }

        // Line coding example 115200 8N1
        setLineCoding(connection, 115200, 0, 0, 8)
        // Control line state (DTR+RTS)
        connection.controlTransfer(0x21, 0x22, 0x0003, 0, ByteArray(0), 0, 100)

        device = dev
        conn = connection
        inEp = epIn
        outEp = epOut
        onStatus?.invoke("Connected %04x:%04x".format(dev.vendorId, dev.productId))
        startReader()
    }

    private fun setLineCoding(c: UsbDeviceConnection, baud: Int, stopBits: Int, parity: Int, dataBits: Int) {
        val buf = ByteBuffer.allocate(7)
        buf.putInt(baud)
        buf.put(stopBits.toByte()) // 0=1,1=1.5,2=2
        buf.put(parity.toByte())    // 0=None 1=Odd 2=Even 3=Mark 4=Space
        buf.put(dataBits.toByte())
        c.controlTransfer(0x21, 0x20, 0, 0, buf.array(), 7, 100)
    }

    private fun startReader() {
        val ep = inEp ?: return
        val c = conn ?: return
        readJob?.cancel()
        readJob = scope.launch {
            val buffer = ByteArray(ep.maxPacketSize)
            while (isActive) {
                val len = c.bulkTransfer(ep, buffer, buffer.size, 250)
                if (len != null && len > 0) onData?.invoke(buffer.copyOf(len))
            }
        }
    }

    fun write(bytes: ByteArray): Boolean {
        val ep = outEp ?: return false
        val c = conn ?: return false
        val sent = c.bulkTransfer(ep, bytes, bytes.size, 500)
        return sent == bytes.size
    }
    fun write(text: String, newline: Boolean = false) = write((if (newline) text + "\n" else text).toByteArray())

    fun close() {
        readJob?.cancel(); readJob = null
        runCatching { conn?.close() }
        conn = null; device = null; inEp = null; outEp = null
        onStatus?.invoke("Disconnected")
    }
}
