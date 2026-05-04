import { useCallback, useEffect, useState } from 'react';
import {
  notificationService,
  PermissionStatus,
  PushTokenInfo,
  ScheduledNotificationRow,
} from '../libs/services/notifications/notification-service';

export interface UseNotificationsResult {
  permission: PermissionStatus;
  scheduled: ScheduledNotificationRow[];
  pushToken: PushTokenInfo | null;
  refreshPermission: () => Promise<PermissionStatus>;
  requestPermission: () => Promise<PermissionStatus>;
  refreshSchedule: () => Promise<void>;
  fetchPushToken: () => Promise<PushTokenInfo | null>;
  cancelAll: () => Promise<void>;
}

const INITIAL_PERMISSION: PermissionStatus = {
  granted: false,
  canAskAgain: true,
};

export function useNotifications(): UseNotificationsResult {
  const [permission, setPermission] = useState<PermissionStatus>(INITIAL_PERMISSION);
  const [scheduled, setScheduled] = useState<ScheduledNotificationRow[]>([]);
  const [pushToken, setPushToken] = useState<PushTokenInfo | null>(null);

  const refreshPermission = useCallback(async () => {
    const status = await notificationService.getPermission();
    setPermission(status);
    return status;
  }, []);

  const refreshSchedule = useCallback(async () => {
    const list = await notificationService.listScheduled();
    setScheduled(list);
  }, []);

  const requestPermission = useCallback(async () => {
    const status = await notificationService.requestPermission();
    setPermission(status);
    return status;
  }, []);

  const fetchPushToken = useCallback(async () => {
    const token = await notificationService.getPushToken();
    setPushToken(token);
    return token;
  }, []);

  const cancelAll = useCallback(async () => {
    await notificationService.cancelAll();
    await refreshSchedule();
  }, [refreshSchedule]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await notificationService.initialize();
      if (!mounted) return;
      await refreshPermission();
      if (!mounted) return;
      await refreshSchedule();
    })().catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [refreshPermission, refreshSchedule]);

  return {
    permission,
    scheduled,
    pushToken,
    refreshPermission,
    requestPermission,
    refreshSchedule,
    fetchPushToken,
    cancelAll,
  };
}
