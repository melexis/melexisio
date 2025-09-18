package com.melexisio.terminal

import android.hardware.usb.UsbDevice
import android.os.Bundle
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private lateinit var mgr: UsbCdcManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_main)

        val devicesList = findViewById<ListView>(R.id.devicesList)
        val status = findViewById<TextView>(R.id.status)
        val log = findViewById<TextView>(R.id.logView)
        val input = findViewById<EditText>(R.id.inputText)
        val sendBtn = findViewById<Button>(R.id.sendBtn)
        val refreshBtn = findViewById<Button>(R.id.refreshBtn)

        mgr = UsbCdcManager(this)
        mgr.onStatus = { s -> runOnUiThread { status.text = s } }
        mgr.onData = { data ->
            val text = data.decodeToString()
            runOnUiThread { log.append(text) }
        }

        fun refresh() {
            val list = mgr.listCdcDevices()
            val items = list.map { "%04x:%04x".format(it.vendorId, it.productId) }
            devicesList.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, items)
            devicesList.setOnItemClickListener { _, _, pos, _ -> mgr.request(list[pos]) }
        }

        refreshBtn.setOnClickListener { refresh() }
        sendBtn.setOnClickListener {
            val txt = input.text.toString()
            if (txt.isNotEmpty()) lifecycleScope.launch { withContext(Dispatchers.IO) { mgr.write(txt + "\n") } }
            input.text.clear()
        }

        refresh()
    }

    override fun onStart() { super.onStart(); mgr.register() }
    override fun onStop() { mgr.close(); mgr.unregister(); super.onStop() }
}
