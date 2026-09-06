package com.vobixchat.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class CallKeepAliveService : Service() {
    companion object {
        private const val CHANNEL_ID = "vobix_active_call"
        private const val NOTIFICATION_ID = 7812
        private const val ACTION_START = "com.vobixchat.mobile.START_ACTIVE_CALL"
        private const val ACTION_STOP = "com.vobixchat.mobile.STOP_ACTIVE_CALL"
        private const val EXTRA_VIDEO = "video"

        fun start(context: Context, video: Boolean) {
            val intent = Intent(context, CallKeepAliveService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_VIDEO, video)
            }
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, CallKeepAliveService::class.java).apply {
                action = ACTION_STOP
            })
        }
    }

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "Llamadas activas de VobixChat",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "Mantiene activa la llamada al cambiar de aplicación"
                    setSound(null, null)
                    enableVibration(false)
                }
            )
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val video = intent?.getBooleanExtra(EXTRA_VIDEO, false) == true
        val resumeIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("vobix_resume_call", true)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            NOTIFICATION_ID,
            resumeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_vobix)
            .setContentTitle(if (video) "Videollamada VobixChat activa" else "Llamada VobixChat activa")
            .setContentText("Toca para volver a la llamada")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingIntent)
            .build()

        startForeground(NOTIFICATION_ID, notification)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
