import { useState, useMemo } from 'react';
import { addDevice } from '../services/deviceService';
import TimezoneSelect from './TimezoneSelect';

function defaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
  } catch {
    return 'Asia/Ho_Chi_Minh';
  }
}

export default function AddDeviceForm({ onSuccess }) {
  const initialTz = useMemo(() => defaultTimezone(), []);
  const [formData, setFormData] = useState({
    childName: '',
    deviceId: '',
    timezone: initialTz,
  });

  const [status, setStatus] = useState({
    loading: false,
    error: '',
    success: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ loading: true, error: '', success: '' });

    try {
      const payload = {
        childName: formData.childName.trim(),
        timezone: formData.timezone.trim() || initialTz,
      };
      const trimmedId = formData.deviceId.trim();
      if (trimmedId) {
        payload.deviceId = trimmedId;
      }

      const res = await addDevice(payload);

      setStatus({
        loading: false,
        error: '',
        success: res.message || 'Device added successfully.',
      });

      setFormData({
        childName: '',
        deviceId: '',
        timezone: initialTz,
      });

      onSuccess?.(res.data);
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        'Failed to add device.';

      setStatus({
        loading: false,
        error: errorMessage,
        success: '',
      });
    }
  };

  return (
    <div className="add-device-form">
      <p className="add-device-form__hint">
        The server can generate a device ID for you, or paste a UUID to match Traccar Client.
      </p>

      {status.success && (
        <div className="add-device-form__banner add-device-form__banner--ok">
          {status.success}
        </div>
      )}

      {status.error && (
        <div className="add-device-form__banner add-device-form__banner--err">
          {status.error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-grid">
        <div className="field">
          <label htmlFor="childName">Child&apos;s name</label>
          <input
            type="text"
            id="childName"
            name="childName"
            placeholder="e.g. Alex"
            value={formData.childName}
            onChange={handleChange}
            required
            disabled={status.loading}
          />
        </div>

        <div className="field">
          <label htmlFor="deviceId">Device UUID (optional)</label>
          <input
            type="text"
            id="deviceId"
            name="deviceId"
            className="font-mono text-sm"
            placeholder="Leave empty to auto-generate"
            value={formData.deviceId}
            onChange={handleChange}
            disabled={status.loading}
          />
        </div>

        <div className="field">
          <label htmlFor="timezone">Timezone</label>
          <TimezoneSelect
            id="timezone"
            name="timezone"
            value={formData.timezone}
            onChange={handleChange}
            required
            disabled={status.loading}
            aria-label="Time zone"
          />
          <p className="card-note">Choose your region from the list (IANA).</p>
        </div>

        <button
          className="btn btn-brand btn-block"
          type="submit"
          disabled={status.loading}
        >
          {status.loading ? 'Saving…' : 'Register device'}
        </button>
      </form>
    </div>
  );
}
