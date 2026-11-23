package com.flatapp.wifi

import android.app.PendingIntent
import android.app.job.JobParameters
import android.app.job.JobService
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Bundle
import android.os.PersistableBundle
import android.util.Log
import expo.modules.interfaces.taskManager.TaskConsumer
import expo.modules.interfaces.taskManager.TaskConsumerInterface
import expo.modules.interfaces.taskManager.TaskInterface
import expo.modules.interfaces.taskManager.TaskManagerUtilsInterface

/**
 * Wakes a JavaScript task (expo-task-manager) whenever the phone joins a Wi-Fi network, even while
 * the app is closed, with the network's name in the task data as `ssid` ("" when Android hides it).
 *
 * Android delivers this through ConnectivityManager.registerNetworkCallback with a PendingIntent,
 * the API meant for apps that are not running. Registering while already on Wi-Fi fires at once.
 * Built like expo-location's geofencing consumer: the broadcast schedules a job, and the job runs
 * the task. The task manager registers it again whenever the app process starts, which brings it
 * back after a phone restart.
 */
class WifiTaskConsumer(context: Context, taskManagerUtils: TaskManagerUtilsInterface?) :
  TaskConsumer(context, taskManagerUtils), TaskConsumerInterface {

  private var task: TaskInterface? = null
  private var pendingIntent: PendingIntent? = null

  override fun taskType(): String = "flatWifi"

  override fun didRegister(task: TaskInterface) {
    this.task = task
    startWatching()
  }

  override fun didUnregister() {
    stopWatching()
    task = null
  }

  override fun didReceiveBroadcast(intent: Intent) {
    val app = context?.applicationContext ?: return
    val data = PersistableBundle().apply { putString("ssid", WifiReader.currentSsid(app) ?: "") }
    taskManagerUtils.scheduleJob(app, task, listOf(data))
  }

  override fun didExecuteJob(jobService: JobService, params: JobParameters): Boolean {
    val task = task ?: return false
    val items = taskManagerUtils.extractDataFromJobParams(params)
    if (items.isEmpty()) return false

    // The job stays alive until every task run has called back.
    var remaining = items.size
    val lock = Any()
    for (item in items) {
      val bundle = Bundle().apply { putString("ssid", item.getString("ssid") ?: "") }
      task.execute(bundle, null) {
        val done = synchronized(lock) { --remaining == 0 }
        if (done) jobService.jobFinished(params, false)
      }
    }
    return true
  }

  private fun startWatching() {
    val app = context?.applicationContext ?: return
    val connectivity = app.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
    val intent = taskManagerUtils.createTaskIntent(app, task)
    val request = NetworkRequest.Builder()
      .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
      .build()
    try {
      connectivity.registerNetworkCallback(request, intent)
      pendingIntent = intent
    } catch (e: RuntimeException) {
      // SecurityException without the network-state permission, or the per-app request limit.
      Log.w(TAG, "Could not watch Wi-Fi", e)
    }
  }

  private fun stopWatching() {
    val intent = pendingIntent ?: return
    val app = context?.applicationContext
    val connectivity = app?.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    try {
      connectivity?.unregisterNetworkCallback(intent)
    } catch (e: RuntimeException) {
      Log.w(TAG, "Could not stop watching Wi-Fi", e)
    }
    intent.cancel()
    pendingIntent = null
  }

  companion object {
    private const val TAG = "FlatWifiTaskConsumer"
  }
}
