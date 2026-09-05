package com.vobixchat.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object CallNotifications {
    const val CALL_CHANNEL = "vobix_calls"
    const val MESSAGE_CHANNEL = "vobix_messages"
    private const val CALL_ID = 7811

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CALL_CHANNEL, "Llamadas VobixChat", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Videollamadas y llamadas entrantes"
            setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), null)
            enableVibration(true)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        })
        manager.createNotificationChannel(NotificationChannel(MESSAGE_CHANNEL, "Mensajes VobixChat", NotificationManager.IMPORTANCE_DEFAULT))
    }

    fun showIncomingCall(context: Context, data: Map<String, String>) {
        createChannels(context)
        val title = if (data["type"] == "video-call") "Videollamada entrante" else "Llamada entrante"
        val caller = data["callerName"] ?: "Contacto"
        val url = data["url"] ?: "/inbox.html"

        val fullScreenIntent = Intent(context, IncomingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("title", title)
            putExtra("caller", caller)
            putExtra("vobix_url", url)
        }
        val fullScreenPending = PendingIntent.getActivity(context, CALL_ID, fullScreenIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val notification = NotificationCompat.Builder(context, CALL_CHANNEL)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setContentTitle(title)
            .setContentText(caller)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setAutoCancel(true)
            .setFullScreenIntent(fullScreenPending, true)
            .setContentIntent(fullScreenPending)
            .build()

        NotificationManagerCompat.from(context).notify(CALL_ID, notification)
    }

    fun closeIncomingCall(context: Context) {
        NotificationManagerCompat.from(context).cancel(CALL_ID)
    }
}
