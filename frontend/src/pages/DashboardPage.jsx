import { useEffect, useMemo, useState } from 'react';
import { Toaster, toast } from 'sonner';
import useAuth from '../hooks/useAuth';
import useDevices from '../hooks/useDevice';
import { getAllUserAlerts } from '../services/alertService';
import { getLogsByDevice } from '../services/logService';
import Map from '../components/Map';
import AddDeviceForm from '../components/AddDeviceForm';
import EditDeviceModal from '../components/EditDeviceModal';
import ParentRealtimeToasts from '../components/ParentRealtimeToasts';
import { removeDevice } from '../services/deviceService';

const TAB_KEYS = ['profile', 'devices', 'map', 'boundary', 'alerts', 'logs'];

function getInitials(user) {
  const first = user?.fname?.trim()?.[0] || 'P';
  const last = user?.lname?.trim()?.[0] || 'A';
  return `${first}${last}`.toUpperCase();
}

function alertBadgeClass(type) {
  if (type === 'EXIT') return 'badge-type badge-type--exit';
  if (type === 'ENTER') return 'badge-type badge-type--enter';
  if (type === 'OUT_OF_SIGNAL') return 'badge-type badge-type--signal';
  return 'badge-type badge-type--other';
}

export default function DashboardPage() {
  const { user, logout, updateProfile, changePassword } = useAuth();
  const { devices, loading, refetch: refetchDevices } = useDevices(user?.user_id);
  const [activeTab, setActiveTab] = useState('profile');
  const [configTarget, setConfigTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
  /** Bump when (re)opening the map so Leaflet remounts with fresh API coords, not stale React state. */
  const [mapViewSession, setMapViewSession] = useState(0);
  const [mapEditSession, setMapEditSession] = useState(0);
  const [profileForm, setProfileForm] = useState({ fname: '', lname: '', phone: '' });
  
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [alertsList, setAlertsList] = useState([]);
  const [alertsCursor, setAlertsCursor] = useState(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [logForm, setLogForm] = useState({
    deviceId: '',
    date: '',
    startTime: '',
    duration: 15,
  });
  const [logsList, setLogsList] = useState([]);
  const [logsCursor, setLogsCursor] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);

  useEffect(() => {
    setProfileForm({
      fname: user?.fname || '',
      lname: user?.lname || '',
      phone: user?.phone || '',
    });
  }, [user]);

  useEffect(() => {
    setConfigTarget(null);
    setViewTarget(null);
  }, [activeTab]);

  const tabMeta = useMemo(
    () => ({
      profile: {
        title: 'Profile',
        subtitle: 'Your account details and password.',
      },
      devices: {
        title: 'Devices',
        subtitle: 'Register each child device and copy the UUID into Traccar Client.',
      },
      map: {
        title: 'Live map',
        subtitle: 'Pick a child to see location updates in real time.',
      },
      boundary: {
        title: 'Safe zones',
        subtitle: 'Draw circles or polygons — you can add several zones per child.',
      },
      alerts: {
        title: 'Alerts',
        subtitle: 'History of enter, exit, and offline events.',
      },
      logs: {
        title: 'Logs',
        subtitle: 'View detailed location logs by time range.',
      },
    }),
    []
  );

  useEffect(() => {
    if (activeTab !== 'alerts') return;
    let cancelled = false;
    (async () => {
      setAlertsLoading(true);
      setAlertsList([]);
      setAlertsCursor(null);
      try {
        const { alerts, nextCursor } = await getAllUserAlerts({ limit: 25 });
        if (!cancelled) {
          setAlertsList(alerts);
          setAlertsCursor(nextCursor);
        }
      } catch (e) {
        console.error(e);
        toast.error('Could not load alerts');
      } finally {
        if (!cancelled) setAlertsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  async function loadMoreAlerts() {
    if (!alertsCursor || alertsLoading) return;
    setAlertsLoading(true);
    try {
      const { alerts, nextCursor } = await getAllUserAlerts({
        limit: 25,
        cursor: alertsCursor,
      });
      setAlertsList((prev) => [...prev, ...alerts]);
      setAlertsCursor(nextCursor);
    } catch (e) {
      console.error(e);
      toast.error('Could not load more alerts');
    } finally {
      setAlertsLoading(false);
    }
  }
  async function fetchLogs({ deviceId, from, to, cursor = null }) {
    const response = await getLogsByDevice({
      deviceId,
      from,
      to,
      cursor,
    });
    

    return {
      logs: response.logs,
      nextCursor: response.nextCursor,
    };
  }
  async function handleLogSearch(e) {
    e.preventDefault();
    const { deviceId, date, startTime, duration } = logForm;
    if (!deviceId || !date || !startTime) {
      toast.error("Please fill all fields");
      return;
    }

    if (duration < 1 || duration > 60) {
      toast.error("Duration must be between 1 and 60 minutes");
      return;
    }
    try {

      setLogsLoading(true);
      setLogsList([]);
      setLogsCursor(null);

      const { deviceId, date, startTime, duration } = logForm;

      const fromLocal = new Date(`${date}T${startTime}`);
      const toLocal = new Date(fromLocal.getTime() + duration * 60 * 1000);

      const { logs, nextCursor } = await fetchLogs({
        deviceId,
        from: fromLocal.toISOString(),
        to: toLocal.toISOString(),
      });

      setLogsList(logs);
      setLogsCursor(nextCursor);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load logs');
    } finally {
      setLogsLoading(false);
    }
  }
  async function loadMoreLogs() {
    if (!logsCursor || logsLoading) return;

    setLogsLoading(true);

    try {
      const { deviceId, date, startTime, duration } = logForm;

      const fromLocal = new Date(`${date}T${startTime}`);
      const from = new Date(
        fromLocal.getTime() - fromLocal.getTimezoneOffset() * 60000
      );
      const to = new Date(from.getTime() + duration * 60 * 1000);

      const { logs, nextCursor } = await fetchLogs({
        deviceId,
        from: from.toISOString(),
        to: to.toISOString(),
        cursor: logsCursor,
      });

      setLogsList((prev) => [...prev, ...logs]);
      setLogsCursor(nextCursor);
    } catch (err) {
      toast.error('Failed to load more logs');
    } finally {
      setLogsLoading(false);
    }
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setProfileNotice('');
    setProfileError('');

    try {
      await updateProfile(profileForm);
      setProfileNotice('Account information updated successfully.');
    } catch (err) {
      setProfileError(err?.response?.data?.error || 'Unable to update account.');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault();
    setChangingPassword(true);
    setPasswordNotice('');
    setPasswordError('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New password and confirm password do not match.');
      setChangingPassword(false);
      return;
    }

    try {
      await changePassword({
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ newPassword: '', confirmPassword: '' });
      setPasswordNotice('Password changed successfully.');
    } catch (err) {
      setPasswordError(err?.response?.data?.error || 'Unable to change password.');
    } finally {
      setChangingPassword(false);
    }
  }

  const activeMeta = tabMeta[activeTab];

  async function selectMapChild(device) {
    try {
      const list = await refetchDevices();
      const fresh = Array.isArray(list) ? list.find((d) => d.device_id === device.device_id) : null;
      setViewTarget(fresh ?? device);
      setMapViewSession((n) => n + 1);
    } catch {
      setViewTarget(device);
      setMapViewSession((n) => n + 1);
    }
  }

  async function selectBoundaryChild(device) {
    try {
      const list = await refetchDevices();
      const fresh = Array.isArray(list) ? list.find((d) => d.device_id === device.device_id) : null;
      setConfigTarget(fresh ?? device);
      setMapEditSession((n) => n + 1);
    } catch {
      setConfigTarget(device);
      setMapEditSession((n) => n + 1);
    }
  }

  async function handleRemoveDevice(d) {
    const ok = window.confirm(
      `Remove "${d.child_name}" from your account? The device will no longer appear for live map, zones, or new alerts. This action cannot be undone in the app.`
    );
    if (!ok) return;
    try {
      await removeDevice(d.device_id);
      toast.success('Device removed');
      setEditingDevice((cur) => (cur?.device_id === d.device_id ? null : cur));
      if (viewTarget?.device_id === d.device_id) setViewTarget(null);
      if (configTarget?.device_id === d.device_id) setConfigTarget(null);
      await refetchDevices();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not remove device');
    }
  }

  return (
    <main className="dashboard-page">
      <Toaster richColors position="top-right" closeButton />
      <ParentRealtimeToasts devices={devices} />
      <section className="dashboard-shell">
        <header className="dashboard-header">
          <div className="dashboard-brand-row">
            <div className="brand-chip brand-chip-hero">
              <span className="brand-dot" />
              CLMS
            </div>
            <button className="btn btn-ghost dashboard-signout" onClick={logout} type="button">
              Sign out
            </button>
          </div>

          <div className="dashboard-hero">
            <div>
              <p className="dashboard-greeting">Hello, {user?.fname}</p>
              <h1>Child Location Monitoring</h1>
              <p>
                Manage devices, live tracking, multiple safe zones per child, and alert history in one
                place.
              </p>
            </div>
            <div className="dashboard-hero-card">
              <div className="avatar large">{getInitials(user)}</div>
              <div>
                <strong>
                  {user?.fname} {user?.lname}
                </strong>
                <p>{user?.email}</p>
              </div>
            </div>
          </div>
        </header>

        <nav className="dashboard-tabs" aria-label="Dashboard tabs">
          {TAB_KEYS.map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              className={`dashboard-tab ${activeTab === tabKey ? 'active' : ''}`}
              onClick={() => setActiveTab(tabKey)}
            >
              {tabMeta[tabKey].title}
            </button>
          ))}
        </nav>

        <section className="dashboard-body">
          <div className="dashboard-body-intro">
            <p>{activeMeta.subtitle}</p>
          </div>

          {activeTab === 'profile' ? (
            <div className="dashboard-grid-layout">
              <article className="card dashboard-card profile-summary-card">
                <div className="mini-card-label">Overview</div>
                <div className="account-summary account-summary-wide">
                  <div className="avatar large">{getInitials(user)}</div>
                  <div>
                    <h2>
                      {user?.fname} {user?.lname}
                    </h2>
                    <p>{user?.email}</p>
                    <p>{user?.phone ? `Phone: ${user.phone}` : 'Phone not set (needed for SMS alerts)'}</p>
                  </div>
                </div>
              </article>

              <article className="card dashboard-card">
                <div className="mini-card-label">Edit profile</div>
                <form className="form-grid account-form" onSubmit={handleProfileSubmit}>
                  <div className="inline-two">
                    <div className="field">
                      <label>First name</label>
                      <input
                        value={profileForm.fname}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, fname: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="field">
                      <label>Last name</label>
                      <input
                        value={profileForm.lname}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, lname: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Phone number</label>
                    <input
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
                    />
                  </div>
                  {profileError ? <p className="error-text">{profileError}</p> : null}
                  {profileNotice ? <p className="ok-text">{profileNotice}</p> : null}
                  <button className="btn btn-brand btn-block" type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save profile'}
                  </button>
                </form>
              </article>

              <article className="card dashboard-card">
                <div className="mini-card-label">Change password</div>
                <form className="form-grid" onSubmit={handleChangePassword}>
                  <div className="field">
                    <label>New password</label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                      }
                      minLength={8}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>Confirm new password</label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                      }
                      minLength={8}
                      required
                    />
                  </div>
                  <p className="card-note">Use at least 8 characters.</p>
                  {passwordError ? <p className="error-text">{passwordError}</p> : null}
                  {passwordNotice ? <p className="ok-text">{passwordNotice}</p> : null}
                  <button className="btn btn-brand btn-block" type="submit" disabled={changingPassword}>
                    {changingPassword ? 'Updating…' : 'Update password'}
                  </button>
                </form>
              </article>
            </div>
          ) : activeTab === 'devices' ? (
            <div className="dashboard-grid-layout">
              <article className="card dashboard-card">
                <div className="mini-card-label">Add device</div>
                <AddDeviceForm
                  onSuccess={() => {
                    refetchDevices();
                    toast.success('Device list updated');
                  }}
                />
              </article>
              <article className="card dashboard-card">
                <div className="mini-card-label">Registered devices</div>
                {loading ? (
                  <p className="empty-hint">Loading devices…</p>
                ) : devices.length === 0 ? (
                  <p className="empty-hint">No devices yet. Add a child above and paste the UUID into Traccar.</p>
                ) : (
                  <ul className="device-list">
                    {devices.map((d) => (
                      <li key={d.device_id} className="device-list__item">
                        <div className="device-list__row">
                          <div className="device-list__main">
                            <div className="device-list__name">{d.child_name}</div>
                            <div className="device-list__id">{d.device_id}</div>
                          </div>
                          <div className="device-list__actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-compact"
                              onClick={() => {
                                navigator.clipboard.writeText(d.device_id);
                                toast.success('Device ID copied');
                              }}
                            >
                              Copy UUID
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-compact"
                              onClick={() => setEditingDevice(d)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-compact"
                              onClick={() => handleRemoveDevice(d)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>
          ) : activeTab === 'map' ? (
            <article className="card dashboard-card dashboard-panel-card">
              {!viewTarget ? (
                <>
                  <div className="tab-panel-head">
                    <div className="mini-card-label">Select child</div>
                    <h2>Who do you want to track?</h2>
                    <p>Choose a device to open the live map and connection status.</p>
                  </div>
                  {loading ? (
                    <p className="empty-hint">Loading devices…</p>
                  ) : devices.length === 0 ? (
                    <p className="empty-hint">Add a device in the Devices tab first.</p>
                  ) : (
                    <div className="picker-grid">
                      {devices.map((device) => (
                        <button
                          key={device.device_id}
                          type="button"
                          className="picker-card picker-card--map"
                          onClick={() => selectMapChild(device)}
                        >
                          <span className="picker-card__avatar">{device.child_name?.[0]?.toUpperCase()}</span>
                          <div>
                            <div className="picker-card__title">{device.child_name}</div>
                            <div className="picker-card__meta">Live location &amp; status</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="context-bar context-bar--map">
                    <strong>Tracking: {viewTarget.child_name}</strong>
                    <button type="button" className="btn-text" onClick={() => setViewTarget(null)}>
                      Change child
                    </button>
                  </div>
                  <Map
                    key={`map-view-${viewTarget.device_id}-${mapViewSession}`}
                    mode="view"
                    deviceId={viewTarget.device_id}
                    childName={viewTarget.child_name}
                    initialPosition={
                      viewTarget.last_lat != null &&
                      viewTarget.last_lon != null &&
                      viewTarget.last_lat !== '' &&
                      viewTarget.last_lon !== ''
                        ? [parseFloat(viewTarget.last_lat), parseFloat(viewTarget.last_lon)]
                        : null
                    }
                  />
                </>
              )}
            </article>
          ) : activeTab === 'alerts' ? (
          <article className="card dashboard-card">
            <div className="mini-card-label">History</div>
            {alertsLoading && alertsList.length === 0 ? (
              <p className="empty-hint">Loading alerts…</p>
            ) : alertsList.length === 0 ? (
              <p className="empty-hint">No alerts yet. Events appear when a child leaves a zone or goes offline.</p>
            ) : (
              <>
                <div className="alert-table-wrap">
                  <table className="alert-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Child</th>
                        <th>Type</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alertsList.map((a) => (
                        <tr key={a.alert_id}>
                          <td>{a.created_at}</td>
                          <td>{a.child_name || '—'}</td>
                          <td>
                            <span className={alertBadgeClass(a.alert_type)}>{a.alert_type}</span>
                          </td>
                          <td title={a.message}>{a.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {alertsCursor ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ marginTop: '1rem' }}
                    disabled={alertsLoading}
                    onClick={() => loadMoreAlerts()}
                  >
                    {alertsLoading ? 'Loading…' : 'Load more'}
                  </button>
                ) : null}
              </>
            )}
          </article>
          ) : activeTab === 'logs' ? (
          <article className="card dashboard-card">
            <div className="mini-card-label">Log Viewer</div>

            {/* FORM */}
            <form className="form-grid" onSubmit={handleLogSearch}>
              <div className="field">
                <label>Device</label>
                <select
                  value={logForm.deviceId}
                  onChange={(e) =>
                    setLogForm((p) => ({ ...p, deviceId: e.target.value }))
                  }
                  required
                >
                  <option value="">Select device</option>
                  {devices.map((d) => (
                    <option key={d.device_id} value={d.device_id}>
                      {d.child_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="inline-two">
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={logForm.date}
                    onChange={(e) =>
                      setLogForm((p) => ({ ...p, date: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="field">
                  <label>Start Time</label>
                  <input
                    type="time"
                    value={logForm.startTime}
                    onChange={(e) =>
                      setLogForm((p) => ({ ...p, startTime: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label>Duration (minutes)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={logForm.duration}
                  onChange={(e) =>
                    setLogForm((p) => ({ ...p, duration: Number(e.target.value) }))
                  }
                />
              </div>

              <button className="btn btn-brand">Load Logs</button>
            </form>

            {/* RESULTS */}
            {logsLoading && logsList.length === 0 ? (
              <p className="empty-hint">Loading logs…</p>
            ) : logsList.length === 0 ? (
              <p className="empty-hint">No logs found.</p>
            ) : (
              <>
              <div className="log-table-wrap" style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
                <table className="log-table" style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                      <th style={{ padding: '12px 16px' }}>Date & Time</th>
                      <th style={{ padding: '12px 16px' }}>Coordinates</th>
                      <th style={{ padding: '12px 16px' }}>Metrics</th>
                      <th style={{ padding: '12px 16px' }}>Battery / Activity</th>
                      <th style={{ padding: '12px 16px' }}>Zone</th>
                      <th style={{ padding: '12px 16px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsList.map((log) => {
                      const isOutside = log.boundary_status === 'OUTSIDE';
                      const logDate = new Date(log.timestamp);

                      return (
                        <tr key={log.log_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          {/* TIME & DATE STACKED */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: '600', color: '#111827' }}>
                              {logDate.toLocaleTimeString()}
                            </div>
                            <div style={{ fontSize: '0.85em', color: '#6b7280' }}>
                              {logDate.toLocaleDateString()}
                            </div>
                          </td>

                          {/* LAT / LON TRIMMED & STACKED */}
                          <td style={{ padding: '12px 16px', fontSize: '0.9em', color: '#374151' }}>
                            <div>Lat: {parseFloat(log.latitude).toFixed(5)}</div>
                            <div>Lon: {parseFloat(log.longitude).toFixed(5)}</div>
                          </td>

                          {/* METRICS GROUPED */}
                          <td style={{ padding: '12px 16px', fontSize: '0.85em', color: '#4b5563' }}>
                            <div>Speed: <strong>{log.speed} m/s</strong> • Head: {log.heading}°</div>
                            <div>Alt: {log.altitude}m • Acc: ±{log.accuracy}m</div>
                          </td>

                          {/* BATTERY & ACTIVITY */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: '500' }}>{log.battery_level}%</div>
                            <div style={{ fontSize: '0.85em', color: '#6b7280' }}>{log.activity_type}</div>
                          </td>

                          {/* ZONE */}
                          <td style={{ padding: '12px 16px', color: '#374151' }}>
                            {log.zone_name || log.zone_id || '—'}
                          </td>

                          {/* STATUS BADGE */}
                          <td style={{ padding: '12px 16px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '4px 10px',
                                borderRadius: '9999px',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                backgroundColor: isOutside ? '#fee2e2' : '#dcfce7',
                                color: isOutside ? '#dc2626' : '#166534',
                              }}
                            >
                              {log.boundary_status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

                {/* PAGINATION BUTTON RESTORED */}
              {logsCursor && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={loadMoreLogs}
                    disabled={logsLoading}
                    style={{ padding: '8px 16px', fontWeight: '500' }}
                  >
                    {logsLoading ? 'Loading more logs…' : 'Load more logs'}
                  </button>
                </div>
              )}
              </>
            )}
          </article>
          ) : (
            <article className="card dashboard-card dashboard-panel-card">
              {!configTarget ? (
                <>
                  <div className="tab-panel-head">
                    <div className="mini-card-label">Select child</div>
                    <h2>Who is this zone for?</h2>
                    <p>You can create multiple circles or polygons per child. Give each zone a clear name.</p>
                  </div>
                  {loading ? (
                    <p className="empty-hint">Loading devices…</p>
                  ) : devices.length === 0 ? (
                    <p className="empty-hint">Register a device first, then come back here.</p>
                  ) : (
                    <div className="picker-grid">
                      {devices.map((device) => (
                        <button
                          key={device.device_id}
                          type="button"
                          className="picker-card picker-card--boundary"
                          onClick={() => selectBoundaryChild(device)}
                        >
                          <span className="picker-card__avatar">{device.child_name?.[0]?.toUpperCase()}</span>
                          <div>
                            <div className="picker-card__title">{device.child_name}</div>
                            <div className="picker-card__meta picker-card__meta--mono">{device.device_id}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="context-bar context-bar--boundary">
                    <strong>Zones for {configTarget.child_name}</strong>
                    <button type="button" className="btn-text" onClick={() => setConfigTarget(null)}>
                      Change child
                    </button>
                  </div>
                  <Map
                    key={`map-edit-${configTarget.device_id}-${mapEditSession}`}
                    mode="edit"
                    deviceId={configTarget.device_id}
                    childName={configTarget.child_name}
                    initialPosition={
                      configTarget.last_lat != null &&
                      configTarget.last_lon != null &&
                      configTarget.last_lat !== '' &&
                      configTarget.last_lon !== ''
                        ? [parseFloat(configTarget.last_lat), parseFloat(configTarget.last_lon)]
                        : null
                    }
                  />
                </>
              )}
            </article>
          )}
        </section>
      </section>

      <EditDeviceModal
        device={editingDevice}
        open={Boolean(editingDevice)}
        onClose={() => setEditingDevice(null)}
        onSaved={async () => {
          const list = await refetchDevices();
          toast.success('Device updated');
          if (Array.isArray(list) && viewTarget) {
            const u = list.find((x) => x.device_id === viewTarget.device_id);
            if (u) setViewTarget(u);
          }
          if (Array.isArray(list) && configTarget) {
            const u = list.find((x) => x.device_id === configTarget.device_id);
            if (u) setConfigTarget(u);
          }
        }}
      />
    </main>
  );
}
