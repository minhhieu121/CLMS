import { useEffect, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'sonner';

/**
 * Subscribes to Socket.IO alert events for all parent devices while the dashboard is open,
 * so enter/exit/offline toasts appear on every tab — not only when Map is mounted.
 */
export default function ParentRealtimeToasts({ devices = [] }) {
  const outToastByDeviceRef = useRef(new Map());
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  const deviceKey = useMemo(
    () =>
      devices
        .map((d) => d.device_id)
        .filter(Boolean)
        .sort()
        .join(','),
    [devices]
  );

  useEffect(() => {
    if (!deviceKey) return;

    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const socket = io(apiBase, { withCredentials: true, transports: ['polling', 'websocket'] });

    const onEnter = (data) => {
      if (!devicesRef.current.some((d) => d.device_id === data.device_id)) return;
      const tid = outToastByDeviceRef.current.get(data.device_id);
      if (tid) {
        toast.dismiss(tid);
        outToastByDeviceRef.current.delete(data.device_id);
      }
      toast.success(`${data.child_name || 'Child'} is safe`, {
        description: `${data.child_name || 'Child'} entered ${data.zone_name || 'safe zone'}`,
      });
    };

    const onExit = (data) => {
      if (!devicesRef.current.some((d) => d.device_id === data.device_id)) return;
      const id = toast.error('Left safe zone', {
        description: `${data.child_name || 'Child'} left ${data.zone_name || 'the zone'}`,
        duration: Infinity,
      });
      outToastByDeviceRef.current.set(data.device_id, id);
    };
    const onBatteryLow = (data) => {
      toast.warning('Low battery', {
        description: `${child}'s battery is ${data.battery_level}%`, 
      });
    };

    const onSignal = (data) => {
      if (!devicesRef.current.some((d) => d.device_id === data.device_id)) return;
      toast.warning('Signal lost', {
        description: `Lost connection to ${data.child_name || 'Child'}'s device.`,
      });
    };

    socket.on('alert_device_enter_of_zone', onEnter);
    socket.on('alert_device_out_of_zone', onExit);
    socket.on('alert_device_out_of_signal', onSignal);
    socket.on('alert_device_battery_low', onBatteryLow);

    return () => {
      outToastByDeviceRef.current.forEach((tid) => toast.dismiss(tid));
      outToastByDeviceRef.current.clear();
      socket.disconnect();
    };
  }, [deviceKey]);

  return null;
}
