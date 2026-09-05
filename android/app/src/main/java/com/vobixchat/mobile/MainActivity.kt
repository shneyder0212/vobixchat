package com.vobixchat.mobile

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private val mediaPermissionRequestCode = 91

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        CallNotifications.createChannels(this)
        requestNeededPermissions()

        webView = WebView(this)
        webView.setBackgroundColor(Color.rgb(37, 40, 37))
        setContentView(webView)
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        ViewCompat.requestApplyInsets(webView)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString VobixChatAndroid/1.2.2"
        }
        webView.addJavascriptInterface(NativeBridge(), "VobixNative")
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { handleWebPermissionRequest(request) }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                if (pendingWebPermissionRequest == request) pendingWebPermissionRequest = null
            }
        }

        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            getSharedPreferences("vobix", MODE_PRIVATE).edit().putString("fcm_token", token).apply()
            sendTokenToPage(token)
        }

        loadRequestedUrl(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        loadRequestedUrl(intent)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != mediaPermissionRequestCode && requestCode != 90) return
        val granted = hasMediaPermissions()
        pendingWebPermissionRequest?.let { request ->
            if (granted) request.grant(allowedWebResources(request)) else request.deny()
        }
        pendingWebPermissionRequest = null
        dispatchMediaPermissionResult(granted)
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) dispatchMediaPermissionResult(hasMediaPermissions())
    }

    private fun loadRequestedUrl(intent: Intent) {
        val requested = intent.getStringExtra("vobix_url")
        val safeUrl = if (requested?.startsWith("/chat.html") == true) {
            "https://vobixchat.onrender.com$requested"
        } else {
            "https://vobixchat.onrender.com/inbox.html"
        }
        webView.loadUrl(safeUrl)
    }

    private fun sendTokenToPage(token: String) {
        val safe = token.replace("\\", "\\\\").replace("'", "\\'")
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('vobix:fcm-token',{detail:{token:'$safe'}}));",
            null
        )
    }

    private fun hasMediaPermissions(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun requestNativeMediaPermissions() {
        val missing = listOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
            .filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) dispatchMediaPermissionResult(true)
        else ActivityCompat.requestPermissions(this, missing.toTypedArray(), mediaPermissionRequestCode)
    }

    private fun allowedWebResources(request: PermissionRequest): Array<String> = request.resources.filter {
        it == PermissionRequest.RESOURCE_AUDIO_CAPTURE || it == PermissionRequest.RESOURCE_VIDEO_CAPTURE
    }.toTypedArray()

    private fun handleWebPermissionRequest(request: PermissionRequest) {
        if (request.origin.host != "vobixchat.onrender.com") {
            request.deny()
            return
        }
        val allowed = allowedWebResources(request)
        if (allowed.isEmpty()) {
            request.deny()
            return
        }
        if (hasMediaPermissions()) request.grant(allowed)
        else {
            pendingWebPermissionRequest?.deny()
            pendingWebPermissionRequest = request
            requestNativeMediaPermissions()
        }
    }

    private fun dispatchMediaPermissionResult(granted: Boolean) {
        if (!::webView.isInitialized) return
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('vobix:native-media-permission',{detail:{granted:${if (granted) "true" else "false"}}}));",
            null
        )
    }

    private fun requestNeededPermissions() {
        val needed = mutableListOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 33) needed.add(Manifest.permission.POST_NOTIFICATIONS)
        val missing = needed.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) ActivityCompat.requestPermissions(this, missing.toTypedArray(), 90)
    }

    inner class NativeBridge {
        @JavascriptInterface
        fun getFcmToken(): String = getSharedPreferences("vobix", MODE_PRIVATE).getString("fcm_token", "") ?: ""

        @JavascriptInterface
        fun requestMediaPermissions() = runOnUiThread { requestNativeMediaPermissions() }

        @JavascriptInterface
        fun openAppPermissionSettings() = runOnUiThread {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            })
        }

        @JavascriptInterface
        fun hasMediaPermissions(): Boolean = this@MainActivity.hasMediaPermissions()
    }
}
