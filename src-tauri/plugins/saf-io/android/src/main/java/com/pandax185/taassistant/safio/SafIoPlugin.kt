package com.pandax185.taassistant.safio

import android.net.Uri
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.IOException

@InvokeArg
class ReadArgs {
  var uri: String? = null
}

@InvokeArg
class WriteArgs {
  var uri: String? = null
  var dataB64: String? = null
}

/**
 * Reads and writes documents behind SAF content:// URIs through
 * ContentResolver streams. Write uses mode "wt" (truncate-then-write), which
 * the ACTION_CREATE_DOCUMENT contract expects, so size metadata updates
 * correctly — unlike the fs plugin's write path (upstream #3356).
 */
@TauriPlugin
class SafIoPlugin(private val activity: android.app.Activity) : Plugin(activity) {

  @Command
  fun read(invoke: Invoke) {
    val raw = invoke.parseArgs(ReadArgs::class.java).uri
    if (raw.isNullOrBlank()) {
      invoke.reject("No URI provided.")
      return
    }
    val uri = Uri.parse(raw)
    try {
      activity.contentResolver.openInputStream(uri)?.use { input ->
        val bytes = input.readBytes()
        val ret = JSObject()
        ret.put("dataB64", Base64.encodeToString(bytes, Base64.NO_WRAP))
        invoke.resolve(ret)
      } ?: invoke.reject("Cannot open stream for $uri")
    } catch (e: IOException) {
      invoke.reject(e.message ?: "Failed to read $uri")
    } catch (e: SecurityException) {
      invoke.reject("No read permission for $uri")
    }
  }

  @Command
  fun write(invoke: Invoke) {
    val args = invoke.parseArgs(WriteArgs::class.java)
    val raw = args.uri
    if (raw.isNullOrBlank()) {
      invoke.reject("No URI provided.")
      return
    }
    val uri = Uri.parse(raw)
    val data = try {
      Base64.decode(args.dataB64 ?: "", Base64.NO_WRAP)
    } catch (e: IllegalArgumentException) {
      invoke.reject("Invalid base64 payload")
      return
    }
    try {
      activity.contentResolver.openOutputStream(uri, "wt")?.use { output ->
        output.write(data)
        output.flush()
        invoke.resolve(JSObject())
      } ?: invoke.reject("Cannot open output stream for $uri")
    } catch (e: IOException) {
      invoke.reject(e.message ?: "Failed to write $uri")
    } catch (e: SecurityException) {
      invoke.reject("No write permission for $uri")
    }
  }
}
