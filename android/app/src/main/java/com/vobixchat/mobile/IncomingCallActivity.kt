package com.vobixchat.mobile

import android.app.Activity
import android.content.Intent
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class IncomingCallActivity : Activity() {
    private var ringtone: Ringtone? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        CallNotifications.closeIncomingCall(this)
        ringtone = RingtoneManager.getRingtone(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
        ringtone?.play()

        val caller = intent.getStringExtra("caller") ?: "Contacto"
        val title = intent.getStringExtra("title") ?: "Llamada entrante"
        val url = intent.getStringExtra("vobix_url") ?: "/inbox.html"
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(44, 44, 44, 44)
            setBackgroundColor(0xFF173624.toInt())
        }
        layout.addView(TextView(this).apply { text = title; textSize = 22f; setTextColor(0xFFFFFFFF.toInt()); gravity = Gravity.CENTER })
        layout.addView(TextView(this).apply { text = caller; textSize = 34f; setTextColor(0xFFFFFFFF.toInt()); gravity = Gravity.CENTER; setPadding(0, 26, 0, 70) })
        layout.addView(Button(this).apply {
            text = "Aceptar"
            setOnClickListener {
                stopTone()
                startActivity(Intent(this@IncomingCallActivity, MainActivity::class.java).putExtra("vobix_url", url))
                finish()
            }
        })
        layout.addView(Button(this).apply {
            text = "Rechazar"
            setOnClickListener { stopTone(); finish() }
        })
        setContentView(layout)
    }

    override fun onDestroy() { stopTone(); super.onDestroy() }
    private fun stopTone() { ringtone?.stop(); ringtone = null }
}
