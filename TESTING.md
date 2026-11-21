# FlatApp geofence test (3 days)

This test checks whether the phone can reliably tell when you leave or reach the flat. Everything
stays on your phone. At the end you send your log to whoever is collecting the results.

## 1. Install (once)

1. Get `FlatApp-geofence-test.apk` (WhatsApp, Drive or a cable).
2. Tap the file. If Android asks, allow **Install unknown apps** for the app you opened it from
   (WhatsApp, Files and so on), then tap **Install**.
3. Open **FlatApp**.

## 2. Set up (once, standing inside the flat)

1. **1. Permissions → Grant permissions.**
   - Location: choose **While using the app**.
   - On the next screen choose **Allow all the time**. This is required: without it the test cannot
     see you leave while the app is closed.
   - Notifications: **Allow**.
2. **Open app settings → Battery → Unrestricted.** Phone brands hide this in different places:
   - Samsung: Battery → **Unrestricted**.
   - Xiaomi / Redmi / POCO: Battery saver → **No restrictions**, and turn on **Autostart**.
   - OnePlus / Oppo / Realme / Vivo: Battery → **Allow background activity** (and Autostart if shown).
3. **2. Home → Set home to where I am now.** Stand inside the flat, near a window if you can.
4. Leave the radius at **200 m** unless told otherwise.
5. **3. Test → Start test.** Status should say **Running**. Right away you get an **Arrived home**
   alert and a "Phone detected: entered the circle" line: that is Android confirming you start
   inside the circle, not a real arrival.

## 3. For the next 3 days

- Live normally. Do not uninstall or force-stop the app. Closing it from recent apps is fine.
- When you really leave the building, tap **I just left**. When you reach it, tap **I just arrived**.
  Miss a few? That is fine. These taps are the ground truth we compare the phone against.
- When the phone notices, you get a notification: **Left home** or **Arrived home**.
- If you restart your phone, open FlatApp once. It puts the circle back and notes that in the log.

## 4. At the end

Open FlatApp → **Log → Share log** → send it to the person collecting results.

## What we look for

| Question | How the log answers it |
| --- | --- |
| Does every real leave or arrival get detected? | Each "You marked" line should have a matching "Phone detected" line |
| How late is it? | Minutes between your tap and the detection |
| Any false alarms? | "Phone detected" lines with no real movement |
| Does it survive restarts and battery saving? | "Test restarted when the app reopened" lines, and gaps |
