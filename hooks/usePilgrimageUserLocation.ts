// usePilgrimageUserLocation — fetches the current user location once on
// mount. Split out so the route file isn't responsible for cancellation
// boilerplate.

import { useEffect, useRef, useState } from 'react';
import { locationService, type LatLng } from '../libs/services/pilgrimage/location-service';
import { sameLatLng } from '../libs/services/pilgrimage/pilgrimage-screen-state';

export function usePilgrimageUserLocation(): LatLng | null {
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const userLocationRef = useRef<LatLng | null>(null);

  useEffect(() => {
    let cancelled = false;
    locationService
      .getCurrentLocation()
      .then((loc) => {
        if (cancelled || !loc || sameLatLng(userLocationRef.current, loc)) return;
        userLocationRef.current = loc;
        setUserLocation(loc);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return userLocation;
}
