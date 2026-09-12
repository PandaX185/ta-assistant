package com.pandax185.taassistant.fileopen

import androidx.core.content.FileProvider

/**
 * A distinct [FileProvider] subclass so the plugin's `<provider>` doesn't
 * collide with the one the host app already declares (see InstallerFileProvider
 * for the fuller explanation). The authority is `<pkg>.open.fileprovider`.
 */
class OpenFileProvider : FileProvider()