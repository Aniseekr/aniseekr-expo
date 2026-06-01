import { Stack } from 'expo-router';

export default function PilgrimageLayout() {
  // The hub map renders its own native <MapSurface> inline (see map.tsx). A
  // native map inside the screen is hidden correctly by the navigator when
  // covered and stays warm while the hub sits under a pushed detail screen, so
  // no shared keep-alive host is needed (it was a Leaflet-WebView-era workaround
  // — the WebView cold-parse is gone, and a native GL surface bled through the
  // portal's opacity gate on back-navigation).
  return <Stack screenOptions={{ headerShown: false }} />;
}
