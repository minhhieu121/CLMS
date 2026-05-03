import { useState, useEffect, useCallback } from 'react';
import { getMyDevices } from '../services/deviceService';

export default function useDevices(userId) {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId) {
      setDevices([]);
      setSelectedDevice(null);
      setLoading(false);
      return [];
    }

    try {
      setLoading(true);
      const deviceList = await getMyDevices();
      setDevices(deviceList);
      setSelectedDevice((prev) => {
        if (!prev) return deviceList[0] ?? null;
        const still = deviceList.find((d) => d.device_id === prev.device_id);
        return still ?? deviceList[0] ?? null;
      });
      return deviceList;
    } catch (err) {
      console.error('Fetch devices error:', err);
      setDevices([]);
      setSelectedDevice(null);
      return [];
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { devices, selectedDevice, setSelectedDevice, loading, refetch };
}
