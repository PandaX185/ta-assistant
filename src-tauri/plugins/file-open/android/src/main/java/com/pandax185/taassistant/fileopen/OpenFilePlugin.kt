package com.pandax185.taassistant.fileopen

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class OpenFileArgs {
  var path: String? = null
  var mime: String? = null
}

/**
 * Opens a local file with the system default app. Unlike the opener plugin's
 * mobile `open_path` (which sends a bare String instead of { url, with } and
 * never grants URI read permission), this builds a FileProvider `content://`
 * URI with an explicit MIME type and FLAG_GRANT_READ_URI_PERMISSION.
 */
@TauriPlugin
class OpenFilePlugin(private val activity: Activity) : Plugin(activity) {

  @Command
  fun open(invoke: Invoke) {
    val args = invoke.parseArgs(OpenFileArgs::class.java)
    val path = args.path
    if (path.isNullOrBlank()) {
      invoke.reject("No file path provided.")
      return
    }

    // isFile() is false for both a missing path and a directory, so both reject
    // here with an actionable message instead of a "no app can handle it" dialog.
    val file = File(path)
    if (!file.isFile) {
      invoke.reject("File not found on disk at: $path")
      return
    }

    val uri: Uri = try {
      FileProvider.getUriForFile(
        activity,
        "${activity.packageName}.open.fileprovider",
        file
      )
    } catch (e: IllegalArgumentException) {
      invoke.reject(
        "Path is not inside the shared application data directory: $path"
      )
      return
    }

    val mime = args.mime ?: "application/octet-stream"
    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, mime)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    try {
      activity.startActivity(intent)
      invoke.resolve()
    } catch (e: ActivityNotFoundException) {
      invoke.reject("No app on this device can open $mime files.")
    } catch (e: Exception) {
      invoke.reject(e.message ?: "Failed to open file.")
    }
  }
}