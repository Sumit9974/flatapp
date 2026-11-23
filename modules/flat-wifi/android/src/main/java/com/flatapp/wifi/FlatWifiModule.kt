package com.flatapp.wifi

import android.content.Context
import expo.modules.interfaces.taskManager.TaskManagerInterface
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private class TaskManagerMissingException : CodedException("expo-task-manager is not available")

/** FlatApp's home Wi-Fi bridge: read the current network, and wake a task when Wi-Fi connects. */
class FlatWifiModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private val taskManager: TaskManagerInterface by lazy {
    appContext.legacyModule<TaskManagerInterface>() ?: throw TaskManagerMissingException()
  }

  override fun definition() = ModuleDefinition {
    Name("FlatWifi")

    Function("getCurrentSsid") {
      WifiReader.currentSsid(context)
    }

    Function("isWifiEnabled") {
      WifiReader.isWifiEnabled(context)
    }

    AsyncFunction("startWatchingAsync") { taskName: String ->
      taskManager.registerTask(taskName, WifiTaskConsumer::class.java, mutableMapOf<String, Any>())
    }

    AsyncFunction("stopWatchingAsync") { taskName: String ->
      taskManager.unregisterTask(taskName, WifiTaskConsumer::class.java)
    }

    AsyncFunction("isWatchingAsync") { taskName: String ->
      taskManager.taskHasConsumerOfClass(taskName, WifiTaskConsumer::class.java)
    }
  }
}
