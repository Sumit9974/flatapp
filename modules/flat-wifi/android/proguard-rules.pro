# expo-task-manager creates task consumers by reflection and restores them after a restart from the
# class name it saved, so R8 must neither strip nor rename them (expo-location keeps its own the same way).
-keep class com.flatapp.wifi.** { *; }
