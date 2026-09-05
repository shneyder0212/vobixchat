package com.vobixchat.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * CAPA C6.10: SERVICIO NATIVO DE INTERCEPTACIÓN FIREBASE - VOBIXCHAT
 * Captura telemetría de emergencia familiar e insistencia sospechosa en segundo plano.
 * Despierta el hardware telefónico y renderiza alertas prioritarias inalterables.
 */
class VobixFirebaseMessagingService : FirebaseMessagingService() {

    private val TAG = "VobixFirebaseService"
    private val SECURITY_CHANNEL_ID = "vobix_security_alerts"

    /**
     * Se ejecuta automáticamente cuando el servidor de Render emite un token de red nuevo
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "[Capa C6.10] Nuevo token FCM registrado en el hardware: $token")
        // Aquí tu app puede enviar de forma segura el token al endpoint /sync/ de tu servidor
    }

    /**
     * Intercepta los paquetes de datos enviados por el servidor Node.js en tiempo real
     */
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "[Capa C6.10] Paquete Firebase entrante detectado.")

        // Validar si el paquete Firebase trae carga de datos útil de seguridad
        if (remoteMessage.data.isNotEmpty()) {
            val alertCode = remoteMessage.data["alertCode"]
            val offender = remoteMessage.data["offender"]
            val childId = remoteMessage.data["childId"]
            val totalAttempts = remoteMessage.data["totalAttempts"]

            if (alertCode == "VOBIX_SECURITY_ALERT_01") {
                Log.w(TAG, "[Capa C6.10] ¡ALERTA CRÍTICA DETECTADA! Acoso sobre menor: $childId")
                triggerNativeSecurityNotification(offender, totalAttempts)
            }
        }
    }

    /**
     * Configura y dispara el panel emergente prioritario en el sistema de Android
     */
    private fun triggerNativeSecurityNotification(offenderPhone: String?, attempts: String?) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Crear el canal de notificaciones seguro requerido para Android 8.0 en adelante (minSdk 26)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES = "O") {
            val securityChannel = NotificationChannel(
                SECURITY_CHANNEL_ID,
                "Alertas de Seguridad VobixChat",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notificaciones de control parental y emergencias críticas de VobixChat."
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 200, 500, 200, 500) // Patrón de vibración de alarma encendida
            }
            notificationManager.createNotificationChannel(securityChannel)
        }

        // Intención nativa: Si el usuario pulsa la alerta, abre la pantalla de llamadas o el chat protegido
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("vobix_alert_type", "PARENTAL_EMERGENCY")
            putExtra("offender_phone", offenderPhone)
        }

        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES = "M") PendingIntent.FLAG_IMMUTABLE else 0
        )

        // Construcción estructural del diseño gráfico del globo de alerta en Android
        val notificationBuilder = NotificationCompat.Builder(this, SECURITY_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_vobix) // Vincula tu recurso XML inyectado
            .setContentTitle("🛑 Alerta Crítica Vobix Guard")
            .setContentText("El número $offenderPhone intentó llamar a tu hijo $attempts veces seguidas. Bloqueado.")
            .setStyle(NotificationCompat.BigTextStyle().bigText(
                "Seguridad VobixChat: El número desconocido $offenderPhone está insistiendo repetidamente de forma sospechosa. " +
                "El motor de la app ha congelado los accesos preventivamente. Toca aquí para ver detalles."
            ))
            .setPriority(NotificationCompat.PRIORITY_MAX) // Forzar visualización flotante inmediata en pantalla (Heads-up)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

        // Disparar la alerta al procesador con ID único
        notificationManager.notify(84966, notificationBuilder.build())
    }
}
