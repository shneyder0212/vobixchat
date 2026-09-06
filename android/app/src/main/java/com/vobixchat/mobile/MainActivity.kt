package com.vobixchat.mobile

import android.Manifest
import android.annotation.SuppressLint
import android.app.PictureInPictureParams
import android.content.Intent
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.provider.Settings
import android.util.Rational
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt
import com.google.firebase.messaging.FirebaseMessaging
import java.io.File

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingFileChooser: WebChromeClient.FileChooserParams? = null
    private var cameraOutputUri: Uri? = null
    private var activeCall = false
    private var activeVideoCall = false
    private var nativeKeyboardVisible = false
    private var nativeKeyboardHeightCss = 0
    private var nativeKeyboardViewportHeightCss = 0
    private val mediaPermissionRequestCode = 91
    private val cameraFilePermissionRequestCode = 92
    private val notificationPermissionRequestCode = 93
    private val fileChooserLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = filePathCallback ?: return@registerForActivityResult
        val selected = if (result.resultCode == RESULT_OK) {
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
                ?: cameraOutputUri?.let { arrayOf(it) }
        } else null
        callback.onReceiveValue(selected)
        filePathCallback = null
        cameraOutputUri = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        CallNotifications.createChannels(this)
        webView = WebView(this)
        webView.setBackgroundColor(Color.rgb(37, 40, 37))
        setContentView(webView)
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            val density = resources.displayMetrics.density.coerceAtLeast(1f)
            nativeKeyboardVisible = imeVisible && ime.bottom > bars.bottom
            nativeKeyboardHeightCss = if (nativeKeyboardVisible) {
                ((ime.bottom - bars.bottom) / density).roundToInt().coerceAtLeast(0)
            } else 0
            nativeKeyboardViewportHeightCss = if (nativeKeyboardVisible) {
                ((window.decorView.height - ime.bottom) / density).roundToInt().coerceAtLeast(1)
            } else 0
            dispatchNativeKeyboardInsets()
            insets
        }
        ViewCompat.requestApplyInsets(webView)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_NO_CACHE
            userAgentString = "$userAgentString VobixChatAndroid/1.2.9"
        }
        webView.addJavascriptInterface(NativeBridge(), "VobixNative")
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                dispatchNativeKeyboardInsets()
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback
                val wantsCamera = fileChooserParams.isCaptureEnabled &&
                    fileChooserParams.acceptTypes.any { it.isBlank() || it.startsWith("image/") }
                if (wantsCamera && !hasPermission(Manifest.permission.CAMERA)) {
                    pendingFileChooser = fileChooserParams
                    ActivityCompat.requestPermissions(
                        this@MainActivity,
                        arrayOf(Manifest.permission.CAMERA),
                        cameraFilePermissionRequestCode
                    )
                } else {
                    launchFileChooser(fileChooserParams)
                }
                return true
            }

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
        if (intent.getBooleanExtra("vobix_resume_call", false)) {
            webView.onResume()
            return
        }
        loadRequestedUrl(intent)
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (!activeCall || !activeVideoCall || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            enterPictureInPictureMode(
                PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(9, 16))
                    .build()
            )
        } catch (_: Exception) {
            // La llamada continúa mediante el servicio aunque PiP no esté disponible.
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == cameraFilePermissionRequestCode) {
            val chooser = pendingFileChooser
            pendingFileChooser = null
            if (hasPermission(Manifest.permission.CAMERA) && chooser != null) launchFileChooser(chooser)
            else {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = null
            }
            return
        }
        if (requestCode == notificationPermissionRequestCode) {
            dispatchNotificationPermissionResult(hasNotificationPermission())
            return
        }
        if (requestCode != mediaPermissionRequestCode) return
        val request = pendingWebPermissionRequest
        val granted = request != null && hasPermissionsForResources(request.resources)
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

    private fun dispatchNativeKeyboardInsets() {
        if (!::webView.isInitialized) return
        webView.post {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('vobix:native-keyboard'," +
                    "{detail:{visible:$nativeKeyboardVisible," +
                    "height:$nativeKeyboardHeightCss," +
                    "viewportHeight:$nativeKeyboardViewportHeightCss}}));",
                null
            )
        }
    }

    private fun hasMediaPermissions(): Boolean =
        hasPermission(Manifest.permission.CAMERA) && hasPermission(Manifest.permission.RECORD_AUDIO)

    private fun hasNotificationPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            hasPermission(Manifest.permission.POST_NOTIFICATIONS)

    private fun requestNativeNotificationPermission() {
        if (hasNotificationPermission()) {
            dispatchNotificationPermissionResult(true)
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                notificationPermissionRequestCode
            )
        }
    }

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun requestNativeMediaPermissions() {
        val missing = listOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
            .filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) dispatchMediaPermissionResult(true)
        else ActivityCompat.requestPermissions(this, missing.toTypedArray(), mediaPermissionRequestCode)
    }

    private fun hasPermissionsForResources(resources: Array<String>): Boolean = resources.all {
        when (it) {
            PermissionRequest.RESOURCE_AUDIO_CAPTURE -> hasPermission(Manifest.permission.RECORD_AUDIO)
            PermissionRequest.RESOURCE_VIDEO_CAPTURE -> hasPermission(Manifest.permission.CAMERA)
            else -> false
        }
    }

    private fun requestPermissionsForResources(resources: Array<String>) {
        val missing = buildList {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE in resources && !hasPermission(Manifest.permission.RECORD_AUDIO)) add(Manifest.permission.RECORD_AUDIO)
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE in resources && !hasPermission(Manifest.permission.CAMERA)) add(Manifest.permission.CAMERA)
        }
        if (missing.isEmpty()) pendingWebPermissionRequest?.grant(allowedWebResources(pendingWebPermissionRequest!!))
        else ActivityCompat.requestPermissions(this, missing.toTypedArray(), mediaPermissionRequestCode)
    }

    private fun launchFileChooser(params: WebChromeClient.FileChooserParams) {
        val acceptsImages = params.acceptTypes.isEmpty() || params.acceptTypes.any { it.isBlank() || it.startsWith("image/") }
        val acceptsVideo = params.acceptTypes.any { it.startsWith("video/") }
        val galleryIntent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = when {
                acceptsImages && acceptsVideo -> "*/*"
                acceptsImages -> "image/*"
                acceptsVideo -> "video/*"
                else -> params.acceptTypes.firstOrNull { it.isNotBlank() } ?: "*/*"
            }
            if (acceptsImages && acceptsVideo) putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/*", "video/*"))
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)
        }
        val cameraIntent = if (acceptsImages) createCameraIntent() else null
        val videoIntent = if (acceptsVideo) Intent(MediaStore.ACTION_VIDEO_CAPTURE) else null
        val captureIntent = when {
            params.isCaptureEnabled && acceptsVideo && !acceptsImages -> videoIntent
            params.isCaptureEnabled && cameraIntent != null -> cameraIntent
            else -> null
        }
        val intent = captureIntent ?: Intent.createChooser(galleryIntent, "Elegir foto o vídeo").apply {
            val captureOptions = listOfNotNull(cameraIntent, videoIntent).toTypedArray()
            if (captureOptions.isNotEmpty()) putExtra(Intent.EXTRA_INITIAL_INTENTS, captureOptions)
        }
        try {
            fileChooserLauncher.launch(intent)
        } catch (_: Exception) {
            filePathCallback?.onReceiveValue(null)
            filePathCallback = null
            cameraOutputUri = null
        }
    }

    private fun createCameraIntent(): Intent? = try {
        val directory = File(cacheDir, "camera").apply { mkdirs() }
        val photo = File.createTempFile("vobix-photo-", ".jpg", directory)
        cameraOutputUri = FileProvider.getUriForFile(this, "$packageName.files", photo)
        Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        }
    } catch (_: Exception) { null }

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
        if (hasPermissionsForResources(allowed)) request.grant(allowed)
        else {
            pendingWebPermissionRequest?.deny()
            pendingWebPermissionRequest = request
            requestPermissionsForResources(allowed)
        }
    }

    private fun dispatchMediaPermissionResult(granted: Boolean) {
        if (!::webView.isInitialized) return
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('vobix:native-media-permission',{detail:{granted:${if (granted) "true" else "false"}}}));",
            null
        )
    }

    private fun dispatchNotificationPermissionResult(granted: Boolean) {
        if (!::webView.isInitialized) return
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('vobix:native-notification-permission',{detail:{granted:${if (granted) "true" else "false"}}}));",
            null
        )
    }

    inner class NativeBridge {
        @JavascriptInterface
        fun getFcmToken(): String = getSharedPreferences("vobix", MODE_PRIVATE).getString("fcm_token", "") ?: ""

        @JavascriptInterface
        fun requestMediaPermissions() = runOnUiThread { requestNativeMediaPermissions() }

        @JavascriptInterface
        fun requestNotificationPermission() = runOnUiThread { requestNativeNotificationPermission() }

        @JavascriptInterface
        fun openAppPermissionSettings() = runOnUiThread {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            })
        }

        @JavascriptInterface
        fun hasMediaPermissions(): Boolean = this@MainActivity.hasMediaPermissions()

        @JavascriptInterface
        fun hasNotificationPermission(): Boolean = this@MainActivity.hasNotificationPermission()

        @JavascriptInterface
        fun setCallActive(active: Boolean, type: String) = runOnUiThread {
            activeCall = active
            activeVideoCall = active && type == "video"
            if (active) {
                CallKeepAliveService.start(this@MainActivity, activeVideoCall)
            } else {
                CallKeepAliveService.stop(this@MainActivity)
            }
        }

        @Suppress("DEPRECATION")
        @JavascriptInterface
        fun setSpeakerphoneOn(enabled: Boolean): Boolean {
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (enabled) {
                    val speaker = audioManager.availableCommunicationDevices.firstOrNull {
                        it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                    } ?: return false
                    audioManager.setCommunicationDevice(speaker)
                } else {
                    audioManager.clearCommunicationDevice()
                    true
                }
            } else {
                audioManager.isSpeakerphoneOn = enabled
                true
            }
        }

        @Suppress("DEPRECATION")
        @JavascriptInterface
        fun resetCallAudio() {
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice()
            } else {
                audioManager.isSpeakerphoneOn = false
            }
            audioManager.mode = AudioManager.MODE_NORMAL
        }
    }
}
