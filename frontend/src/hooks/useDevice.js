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
      const activeOnly = Array.isArray(deviceList)
        ? deviceList.filter((d) => d.status !== 'INACTIVE')
        : [];
      setDevices(activeOnly);
      setSelectedDevice((prev) => {
        if (!prev) return activeOnly[0] ?? null;
        const still = activeOnly.find((d) => d.device_id === prev.device_id);
        return still ?? activeOnly[0] ?? null;
      });
      return activeOnly;
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
