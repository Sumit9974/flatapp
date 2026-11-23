import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors, radius as corner } from '../theme';

export interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  /** The pin to show; changing it from outside (for example "Use where I am now") moves the map there. */
  pin: LatLng | null;
  /** Circle radius in metres, drawn around the pin. */
  radius: number;
  /** Called when the person taps the map or drags the pin. */
  onPick: (pin: LatLng) => void;
}

/**
 * A map to put the flat's home pin on: tap anywhere or drag the pin, and the Home circle is drawn
 * around it. Leaflet with OpenStreetMap tiles inside a WebView, so there is no API key, no billing
 * account and nothing to pay. The OSM tile policy asks apps to identify themselves: the page gets
 * an https origin (sent as the Referer) and the user agent names FlatApp.
 */
/**
 * react-native-webview 14 declares its class as WebView<P = undefined> with props `WebViewProps & P`,
 * and `X & undefined` is `never` in current TypeScript. An empty object type keeps the props intact.
 */
type NoExtraProps = Record<never, never>;

export function MapPicker({ pin, radius, onPick }: Props) {
  const web = useRef<WebView<NoExtraProps>>(null);
  const [loaded, setLoaded] = useState(false);
  // The last pin the map itself reported, so it is not sent straight back (and the map not re-centred).
  const fromMap = useRef<LatLng | null>(null);

  // Built once: later pin and radius changes go to the page through injectJavaScript.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => pageHtml(pin, radius), []);

  useEffect(() => {
    if (!loaded) return;
    web.current?.injectJavaScript(`window.setRadius(${Number(radius)}); true;`);
  }, [loaded, radius]);

  useEffect(() => {
    if (!loaded || !pin) return;
    const last = fromMap.current;
    if (last && last.lat === pin.lat && last.lng === pin.lng) return;
    web.current?.injectJavaScript(`window.setPin(${Number(pin.lat)}, ${Number(pin.lng)}); true;`);
  }, [loaded, pin]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const p = JSON.parse(event.nativeEvent.data) as Partial<LatLng>;
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number' || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
      const picked = { lat: p.lat, lng: p.lng };
      fromMap.current = picked;
      onPick(picked);
    } catch {
      // Not ours; ignore.
    }
  };

  return (
    <View style={styles.frame} collapsable={false}>
      <WebView<NoExtraProps>
        ref={web}
        style={styles.web}
        // A reserved .invalid name: gives the page an https origin without claiming anyone's domain.
        source={{ html, baseUrl: 'https://flatapp.invalid/' }}
        originWhitelist={['*']}
        applicationNameForUserAgent="FlatApp/0.1 (home pin map)"
        onLoadEnd={() => setLoaded(true)}
        onMessage={onMessage}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';

function pageHtml(start: LatLng | null, radiusM: number): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="${LEAFLET}/leaflet.css">
<style>html,body,#map{height:100%;margin:0;background:#E9EDF3}</style>
</head><body>
<div id="map"></div>
<script src="${LEAFLET}/leaflet.js"></script>
<script>
  var start = ${JSON.stringify(start)};
  var radius = ${Number(radiusM)};
  // No pin yet: show India until the person taps or uses their location.
  var map = L.map('map').setView(start ? [start.lat, start.lng] : [22.5, 79], start ? 18 : 4);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  var marker = null, circle = null;
  function send(lat, lng) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ lat: lat, lng: lng }));
  }
  function place(lat, lng, centre) {
    if (!marker) {
      circle = L.circle([lat, lng], { radius: radius, color: '${colors.primary}', weight: 2, fillOpacity: 0.12 }).addTo(map);
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('drag', function () { circle.setLatLng(marker.getLatLng()); });
      marker.on('dragend', function () { var p = marker.getLatLng(); send(p.lat, p.lng); });
    } else {
      marker.setLatLng([lat, lng]);
      circle.setLatLng([lat, lng]);
    }
    if (centre) map.setView([lat, lng], Math.max(map.getZoom(), 17));
  }
  map.on('click', function (e) { place(e.latlng.lat, e.latlng.lng, false); send(e.latlng.lat, e.latlng.lng); });
  window.setPin = function (lat, lng) { place(lat, lng, true); };
  window.setRadius = function (r) { radius = r; if (circle) circle.setRadius(r); };
  if (start) place(start.lat, start.lng, false);
</script>
</body></html>`;
}

const styles = StyleSheet.create({
  frame: { flex: 1, borderRadius: corner.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  web: { flex: 1, backgroundColor: 'transparent' },
});
