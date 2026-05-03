import { useEffect, useState } from 'react';
import { updateDevice } from '../services/deviceService';

export default function EditDeviceModal({ device, open, onClose, onSaved }) {
  const [childName, setChildName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!device || !open) return;
    setChildName(device.child_name || '');
    setTimezone(device.timezone || '');
    setError('');
  }, [device, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !device) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    const name = childName.trim();
    if (!name) {
      setError("Child's name is required.");
      return;
    }
    const tz = timezone.trim();
    if (!tz) {
      setError('Timezone is required.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await updateDevice(device.device_id, { childName: name, timezone: tz });
      onSaved?.();
      onClose?.();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Could not update device.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="device-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card device-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-device-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mini-card-label">Edit device</div>
        <h2 id="edit-device-title" className="device-modal-title">
          {device.child_name}
        </h2>
        <p className="device-modal-note">
          Device UUID cannot be changed — update Traccar Client if you replace the phone. You can
          rename the child or adjust the timezone used for timestamps.
        </p>

        {error ? <p className="error-text">{error}</p> : null}

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="edit-child-name">Child&apos;s name</label>
            <input
              id="edit-child-name"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="field">
            <label htmlFor="edit-timezone">Timezone (IANA)</label>
            <input
              id="edit-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <p className="device-modal-uuid">UUID: {device.device_id}</p>
          <div className="device-modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-brand" disabled={loading}>
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
