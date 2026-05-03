import api from './api';

export const getLogsByDevice = async ({ deviceId, from, to, cursor }) => {
  const response = await api.get(`/log/history/${deviceId}`, {
    params: { from, to, limit: 100, cursor },
  });

  return {
    logs: response.data?.logs ?? [],
    nextCursor: response.data?.nextCursor ?? null,
  };
};