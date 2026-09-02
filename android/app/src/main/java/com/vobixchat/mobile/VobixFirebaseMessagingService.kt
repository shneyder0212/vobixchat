package com.vobixchat.mobile

import android.content.Intent
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class VobixFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        getSharedPreferences("vobix", MODE_PRIVATE).edit().putString("fcm_token", token).apply()
        sendBroadcast(Intent("com.vobixchat.mobile.FCM_TOKEN_UPDATED"))
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (data["type"] == "call" || data["type"] == "video-call") {
            CallNotifications.showIncomingCall(this, data)
        }
    }
}
