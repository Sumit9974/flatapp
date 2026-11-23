package com.flatapp.wifi

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build

/** Reads the phone's Wi-Fi state. Nothing here leaves the phone; JavaScript compares the name. */
object WifiReader {
  private const val UNKNOWN_SSID = "<unknown ssid>"

  fun isWifiEnabled(context: Context): Boolean {
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    return wifi?.isWifiEnabled ?: false
  }

  /**
   * The name of the Wi-Fi network the phone is connected to, or null when it is not on Wi-Fi or
   * Android hides the name. Android only reveals it with location access granted (all the time,
   * for background use) and location switched on.
   */
  fun currentSsid(context: Context): String? {
    val app = context.applicationContext
    // Android 12+: the Wi-Fi details of any connected Wi-Fi network (not only the default one,
    // which can be mobile data when the Wi-Fi has no internet).
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val connectivity = app.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
      if (connectivity != null) {
        @Suppress("DEPRECATION")
        for (network in connectivity.allNetworks) {
          val caps = connectivity.getNetworkCapabilities(network) ?: continue
          if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue
          clean((caps.transportInfo as? WifiInfo)?.ssid)?.let { return it }
        }
      }
    }
    // Older Android, or the name was redacted above: the classic Wi-Fi manager still reports it
    // to apps with location access.
    val wifi = app.getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return null
    @Suppress("DEPRECATION")
    return clean(wifi.connectionInfo?.ssid)
  }

  private fun clean(raw: String?): String? {
    val name = raw?.trim()?.removeSurrounding("\"") ?: return null
    return if (name.isEmpty() || name == UNKNOWN_SSID) null else name
  }
}
