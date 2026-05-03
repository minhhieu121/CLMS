import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Polygon, Circle } from 'react-leaflet';
import { io } from 'socket.io-client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getBoundaries, createBoundary, updateBoundary, deleteBoundary } from '../services/boundaryService';
import { getLatestAlert } from '../services/alertService';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

function MapResizer() {
    const map = useMap();
    useEffect(() => {
        setTimeout(() => {
            map.invalidateSize();
        }, 200);
    }, [map]);
    return null;
}

function ChangeView({ center }) {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.flyTo(center, map.getZoom(), { animate: true });
        }
    }, [center, map]);
    return null;
}

function FlyToTarget({ target, nonce }) {
    const map = useMap();
    useEffect(() => {
        if (!target || nonce == null) return;
        map.flyTo(target, Math.max(map.getZoom(), 15), { animate: true, duration: 0.85 });
    }, [target, nonce, map]);
    return null;
}

function MapClickHandler({ mode, drawType, setPoints, setCircleCenter }) {
    useMapEvents({
        click: (e) => {
            if (mode === 'edit') {
                if (drawType === 'POLYGON') {
                    setPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
                } else if (drawType === 'CIRCLE') {
                    setCircleCenter([e.latlng.lat, e.latlng.lng]);
                }
            }
        },
    });
    return null;
}

function RecenterButton({ position }) {
    const map = useMap();

    const handleRecenter = () => {
        if (position) {
            map.flyTo(position, map.getZoom(), {
                animate: true,
                duration: 1,
            });
        }
    };

    return (
        <div className="leaflet-bottom leaflet-right" style={{ marginBottom: '30px', marginRight: '10px' }}>
            <div className="leaflet-control" style={{ border: 'none', background: 'none' }}>
                <button type="button" onClick={handleRecenter} title="Recenter to child" className="map-recenter-fab">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        width={22}
                        height={22}
                    >
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M3 12h3m12 0h3M12 3v3m0 12v3"></path>
                    </svg>
                </button>
            </div>
        </div>
    );
}

function timeInputFromApi(t) {
    if (t == null || t === '') return '';
    const s = typeof t === 'string' ? t : String(t);
    return s.length >= 5 ? s.slice(0, 5) : s;
}

function dateInputFromApi(d) {
    if (d == null || d === '') return '';
    if (typeof d === 'string') return d.length >= 10 ? d.slice(0, 10) : d;
    try {
        return new Date(d).toISOString().slice(0, 10);
    } catch {
        return '';
    }
}

function zoneMapCenter(zone) {
    if (zone.type === 'CIRCLE' && zone.center_lat != null && zone.center_lon != null) {
        return [parseFloat(zone.center_lat), parseFloat(zone.center_lon)];
    }
    if (zone.type === 'POLYGON' && zone.points?.length) {
        const pts = [...zone.points].sort((a, b) => a.sequence_order - b.sequence_order);
        const lat = pts.reduce((s, p) => s + parseFloat(p.latitude), 0) / pts.length;
        const lng = pts.reduce((s, p) => s + parseFloat(p.longitude), 0) / pts.length;
        return [lat, lng];
    }
    return null;
}

export default function Map({ deviceId, childName, mode, initialPosition }) {
    const [position, setPosition] = useState(initialPosition || [10.7626, 106.6602]);
    const [isOnline, setIsOnline] = useState(false);

    const [drawType, setDrawType] = useState('POLYGON');
    const [zoneName, setZoneName] = useState('');
    const [scheduleType, setScheduleType] = useState('ALWAYS');
    const [startTime, setStartTime] = useState('');
    const [duration, setDuration] = useState(60);
    const [selectedDays, setSelectedDays] = useState([]);
    const [selectedMonthDays, setSelectedMonthDays] = useState([]);
    const [specificDate, setSpecificDate] = useState('');

    const [polygonPoints, setPolygonPoints] = useState([]);
    const [circleCenter, setCircleCenter] = useState(null);
    const [radius, setRadius] = useState(100);
    const [existingZones, setExistingZones] = useState([]);
    const [childStatus, setChildStatus] = useState('SAFE');
    const [editingZoneId, setEditingZoneId] = useState(null);
    const [flyTarget, setFlyTarget] = useState(null);
    const [flyNonce, setFlyNonce] = useState(0);

    const daysOfWeek = [
        { label: 'S', value: 0 },
        { label: 'M', value: 1 },
        { label: 'T', value: 2 },
        { label: 'W', value: 3 },
        { label: 'T', value: 4 },
        { label: 'F', value: 5 },
        { label: 'S', value: 6 },
    ];

    const toggleDay = (dayVal) => {
        setSelectedDays((prev) => (prev.includes(dayVal) ? prev.filter((x) => x !== dayVal) : [...prev, dayVal]));
    };

    const toggleMonthDay = (dayNum) => {
        setSelectedMonthDays((prev) =>
            prev.includes(dayNum) ? prev.filter((x) => x !== dayNum) : [...prev, dayNum]
        );
    };

    const getScheduleInfo = (zone) => {
        if (zone.schedule_type === 'ALWAYS') return 'Always active';
        const ts = zone.start_time != null ? timeInputFromApi(zone.start_time) : '';
        const timePart = ts ? ` at ${ts}` : '';
        const durPart = zone.duration ? ` for ${zone.duration} mins` : '';
        const combinedTime = timePart + durPart;

        switch (zone.schedule_type) {
            case 'DAILY':
                return `Daily${combinedTime}`;
            case 'WEEKLY':
                return `Weekly on ${zone.days_of_week?.join(', ') || '—'}${combinedTime}`;
            case 'MONTHLY':
                return `Monthly on days ${zone.days_of_month?.join(', ') || '—'}${combinedTime}`;
            case 'ONCE': {
                const date = zone.specific_date ? new Date(zone.specific_date).toLocaleDateString() : '';
                return `Once on ${date}${combinedTime}`;
            }
            default:
                return zone.schedule_type;
        }
    };

    const getStatusColor = () => {
        if (childStatus === 'DANGER') return '#dc2626';
        if (childStatus === 'OFFLINE') return '#94a3b8';
        return '#00b14f';
    };

    const loadZones = useCallback(async () => {
        if (!deviceId) return;
        try {
            const res = await getBoundaries(deviceId);
            if (res.success) setExistingZones(res.data || []);
        } catch (err) {
            console.error('Error fetching zones:', err);
        }
    }, [deviceId]);

    // Do not sync initialPosition on every parent render: that overwrites live socket coords with stale list data.
    // Dashboard remounts this component with a fresh key when picking a child after refetching devices.

    useEffect(() => {
        loadZones();
    }, [loadZones]);

    useEffect(() => {
        if (!deviceId) return;

        const fetchStatus = async () => {
            try {
                const res = await getLatestAlert(deviceId);
                if (res.success && res.data) {
                    if (res.data.alert_type === 'EXIT') setChildStatus('DANGER');
                    else if (res.data.alert_type === 'ENTER') setChildStatus('SAFE');
                    else if (res.data.alert_type === 'OUT_OF_SIGNAL') setChildStatus('OFFLINE');
                }
            } catch (err) {
                console.log('No status history found.');
            }
        };
        fetchStatus();

        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const socket = io(apiBase, { withCredentials: true, transports: ['polling', 'websocket'] });
        socket.on('connect', () => setIsOnline(true));

        socket.on('location_update', (data) => {
            if (data.device_id === deviceId && data.latitude && data.longitude) {
                setPosition([data.latitude, data.longitude]);
            }
        });

        socket.on('alert_device_enter_of_zone', (data) => {
            if (data.device_id === deviceId) {
                setChildStatus('SAFE');
            }
        });

        socket.on('alert_device_out_of_zone', (data) => {
            if (data.device_id === deviceId) {
                setChildStatus('DANGER');
            }
        });

        socket.on('alert_device_out_of_signal', (data) => {
            if (data.device_id === deviceId) {
                setChildStatus('OFFLINE');
            }
        });

        socket.on('connect_error', () => setIsOnline(false));
        return () => socket.disconnect();
    }, [deviceId, childName]);

    const startNewZone = () => {
        setEditingZoneId(null);
        setZoneName('');
        setDrawType('POLYGON');
        setScheduleType('ALWAYS');
        setStartTime('');
        setDuration(60);
        setSelectedDays([]);
        setSelectedMonthDays([]);
        setSpecificDate('');
        setPolygonPoints([]);
        setCircleCenter(null);
        setRadius(100);
    };

    const beginEditZone = (z) => {
        setEditingZoneId(z.zone_id);
        setZoneName(z.zone_name || '');
        setDrawType(z.type);
        setScheduleType(z.schedule_type || 'ALWAYS');
        setStartTime(timeInputFromApi(z.start_time));
        setDuration(z.duration ?? 60);
        const dow = z.days_of_week;
        setSelectedDays(Array.isArray(dow) ? dow.map(Number) : []);
        const dom = z.days_of_month;
        setSelectedMonthDays(Array.isArray(dom) ? dom.map(Number) : []);
        setSpecificDate(dateInputFromApi(z.specific_date));

        if (z.type === 'POLYGON' && z.points?.length) {
            const ordered = [...z.points].sort((a, b) => a.sequence_order - b.sequence_order);
            setPolygonPoints(ordered.map((p) => [parseFloat(p.latitude), parseFloat(p.longitude)]));
            setCircleCenter(null);
        } else if (z.type === 'CIRCLE') {
            setPolygonPoints([]);
            setCircleCenter(
                z.center_lat != null && z.center_lon != null
                    ? [parseFloat(z.center_lat), parseFloat(z.center_lon)]
                    : null
            );
            setRadius(Number(z.radius) || 100);
        }

        const c = zoneMapCenter(z);
        if (c) {
            setFlyTarget(c);
            setFlyNonce((n) => n + 1);
        }
    };

    const buildBoundaryPayload = () => ({
        type: drawType,
        zone_name: zoneName.trim(),
        schedule_type: scheduleType,
        start_time: scheduleType === 'ALWAYS' ? null : startTime,
        duration: scheduleType === 'ALWAYS' ? null : Number(duration),
        days_of_week: scheduleType === 'WEEKLY' ? selectedDays : null,
        days_of_month: scheduleType === 'MONTHLY' ? selectedMonthDays : null,
        specific_date: scheduleType === 'ONCE' ? specificDate : null,
        points:
            drawType === 'POLYGON'
                ? polygonPoints.map((p, i) => ({
                      sequence_order: i + 1,
                      latitude: p[0],
                      longitude: p[1],
                  }))
                : null,
        radius: drawType === 'CIRCLE' ? Number(radius) : null,
        center_lat: drawType === 'CIRCLE' ? circleCenter?.[0] : null,
        center_lon: drawType === 'CIRCLE' ? circleCenter?.[1] : null,
    });

    const handleInternalSave = async () => {
        if (!zoneName.trim()) {
            return toast.warning('Missing name', { description: 'Please enter a zone name.' });
        }

        const boundaryData = buildBoundaryPayload();

        if (drawType === 'POLYGON' && (!boundaryData.points || boundaryData.points.length < 3)) {
            return toast.error('Invalid polygon', { description: 'Add at least three points on the map.' });
        }
        if (drawType === 'CIRCLE' && !circleCenter) {
            return toast.error('Invalid circle', { description: 'Tap the map to set the center.' });
        }

        if (mode !== 'edit' || !deviceId) return;

        const toastId = toast.loading(editingZoneId ? 'Updating zone…' : 'Saving zone…');
        try {
            if (editingZoneId) {
                await updateBoundary(editingZoneId, boundaryData);
                toast.success('Zone updated', {
                    id: toastId,
                    description: `"${boundaryData.zone_name}"`,
                    duration: 3500,
                });
            } else {
                await createBoundary(deviceId, boundaryData);
                toast.success('Zone saved', {
                    id: toastId,
                    description: `"${boundaryData.zone_name}" for ${childName || 'child'}`,
                    duration: 3500,
                });
            }
            await loadZones();
            startNewZone();
        } catch (err) {
            const msg = err.response?.data?.error || err.message || 'Request failed';
            toast.error(editingZoneId ? 'Could not update zone' : 'Could not save zone', {
                id: toastId,
                description: msg,
            });
        }
    };

    const handleDeleteZone = async (z) => {
        if (!window.confirm(`Remove safe zone “${z.zone_name}”? This cannot be undone.`)) return;
        const toastId = toast.loading('Removing zone…');
        try {
            await deleteBoundary(z.zone_id);
            toast.success('Zone removed', { id: toastId });
            if (editingZoneId === z.zone_id) startNewZone();
            await loadZones();
        } catch (err) {
            const msg = err.response?.data?.error || err.message || 'Request failed';
            toast.error('Could not remove zone', { id: toastId, description: msg });
        }
    };

    const zonesOnMap =
        mode === 'edit' && editingZoneId != null
            ? existingZones.filter((z) => z.zone_id !== editingZoneId)
            : existingZones;

    return (
        <div className="map-root">
            {mode === 'edit' && (
                <aside className="map-sidebar">
                    <div className="map-sidebar__block">
                        <h3 className="map-sidebar__title">Your zones</h3>
                        <p className="map-sidebar__hint">
                            Add several safe areas per child. Tap <strong>Edit</strong> to change shape or schedule.
                        </p>
                        {existingZones.length === 0 ? (
                            <p className="map-zone-empty">No zones yet — draw one in the form below.</p>
                        ) : (
                            <ul className="map-zone-list">
                                {existingZones.map((z) => (
                                    <li
                                        key={z.zone_id}
                                        className={`map-zone-card ${editingZoneId === z.zone_id ? 'map-zone-card--active' : ''}`}
                                    >
                                        <div className="map-zone-card__row">
                                            <span className={`map-zone-pill ${z.type === 'CIRCLE' ? 'map-zone-pill--circle' : ''}`}>
                                                {z.type === 'CIRCLE' ? 'Circle' : 'Polygon'}
                                            </span>
                                            <strong className="map-zone-card__name">{z.zone_name}</strong>
                                        </div>
                                        <p className="map-zone-card__sched">{getScheduleInfo(z)}</p>
                                        <div className="map-zone-card__actions">
                                            <button type="button" className="map-zone-btn" onClick={() => beginEditZone(z)}>
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                className="map-zone-btn map-zone-btn--danger"
                                                onClick={() => handleDeleteZone(z)}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <button type="button" className="map-btn-secondary" onClick={startNewZone}>
                            + New zone
                        </button>
                    </div>

                    <div className="map-sidebar__divider" />

                    <h3 className="map-sidebar__title">{editingZoneId ? 'Edit zone' : 'Draw new zone'}</h3>
                    <div className="map-toggle">
                        <button
                            type="button"
                            className={drawType === 'POLYGON' ? 'is-active' : ''}
                            onClick={() => !editingZoneId && setDrawType('POLYGON')}
                            disabled={!!editingZoneId}
                            title={editingZoneId ? 'Type is fixed while editing' : ''}
                        >
                            Polygon
                        </button>
                        <button
                            type="button"
                            className={drawType === 'CIRCLE' ? 'is-active' : ''}
                            onClick={() => !editingZoneId && setDrawType('CIRCLE')}
                            disabled={!!editingZoneId}
                            title={editingZoneId ? 'Type is fixed while editing' : ''}
                        >
                            Circle
                        </button>
                    </div>
                    {editingZoneId ? (
                        <p className="map-sidebar__hint map-sidebar__hint--compact">
                            Adjust vertices (polygon) or drag the center (circle), then save.
                        </p>
                    ) : (
                        <p className="map-sidebar__hint map-sidebar__hint--compact">
                            Tap the map to add points. Polygon: at least three. Circle: center, then set radius.
                        </p>
                    )}

                    <div className="map-field">
                        <label>Zone name</label>
                        <input
                            type="text"
                            value={zoneName}
                            onChange={(e) => setZoneName(e.target.value)}
                            placeholder="e.g. School, Home"
                        />
                    </div>

                    {drawType === 'CIRCLE' && (
                        <div className="map-field">
                            <label>Radius (m)</label>
                            <input type="number" min={3} value={radius} onChange={(e) => setRadius(e.target.value)} />
                        </div>
                    )}

                    <div className="map-field">
                        <label>Schedule</label>
                        <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value)}>
                            <option value="ALWAYS">Always on</option>
                            <option value="DAILY">Daily window</option>
                            <option value="WEEKLY">Weekly</option>
                            <option value="MONTHLY">Monthly</option>
                            <option value="ONCE">One-off date</option>
                        </select>
                    </div>

                    {scheduleType !== 'ALWAYS' && (
                        <div className="map-schedule-box">
                            <div className="map-schedule-grid">
                                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                                <input
                                    type="number"
                                    value={duration}
                                    onChange={(e) => setDuration(e.target.value)}
                                    placeholder="Minutes"
                                    min={1}
                                />
                            </div>
                            {scheduleType === 'WEEKLY' && (
                                <div className="map-day-grid">
                                    {daysOfWeek.map((day) => (
                                        <button
                                            key={day.value}
                                            type="button"
                                            className={`map-day-btn ${selectedDays.includes(day.value) ? 'is-on' : ''}`}
                                            onClick={() => toggleDay(day.value)}
                                        >
                                            {day.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {scheduleType === 'MONTHLY' && (
                                <div className="map-month-grid">
                                    {[...Array(31)].map((_, i) => (
                                        <button
                                            key={i + 1}
                                            type="button"
                                            className={`map-month-btn ${selectedMonthDays.includes(i + 1) ? 'is-on' : ''}`}
                                            onClick={() => toggleMonthDay(i + 1)}
                                        >
                                            {i + 1}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {scheduleType === 'ONCE' && (
                                <input
                                    type="date"
                                    value={specificDate}
                                    onChange={(e) => setSpecificDate(e.target.value)}
                                />
                            )}
                        </div>
                    )}

                    <div className="map-sidebar__actions">
                        <button type="button" className="map-btn-primary" onClick={() => handleInternalSave()}>
                            {editingZoneId ? 'Save changes' : 'Save zone'}
                        </button>
                        {editingZoneId ? (
                            <button type="button" className="map-btn-ghost" onClick={startNewZone}>
                                Cancel edit
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className="map-btn-ghost"
                            onClick={() => {
                                setPolygonPoints([]);
                                setCircleCenter(null);
                            }}
                        >
                            Clear drawing
                        </button>
                    </div>
                </aside>
            )}

            <div className="map-leaflet-shell">
                <div className="map-status-pill">
                    <span className={`map-status-dot ${isOnline ? 'map-status-dot--ok' : 'map-status-dot--bad'}`} />
                    {isOnline ? 'Live' : 'Reconnecting'}
                </div>

                <MapContainer
                    center={position}
                    zoom={16}
                    style={{ height: '100%', width: '100%', minHeight: 'min(65vh, 26rem)' }}
                >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <RecenterButton position={position} />
                    {mode === 'edit' && flyTarget ? <FlyToTarget target={flyTarget} nonce={flyNonce} /> : null}

                    {zonesOnMap.map((zone) => (
                            <React.Fragment key={zone.zone_id}>
                                {zone.type === 'CIRCLE' && zone.center_lat && (
                                    <Circle
                                        center={[parseFloat(zone.center_lat), parseFloat(zone.center_lon)]}
                                        radius={zone.radius}
                                        pathOptions={{
                                            color: '#00b14f',
                                            fillColor: '#00b14f',
                                            fillOpacity: 0.18,
                                            weight: 2,
                                        }}
                                    >
                                        <Popup>
                                            <div className="map-popup">
                                                <div className="map-popup__title">{zone.zone_name}</div>
                                                <div>
                                                    <b>Type:</b> Circle
                                                </div>
                                                <div>
                                                    <b>Radius:</b> {zone.radius}m
                                                </div>
                                                <div>
                                                    <b>Validity:</b> {getScheduleInfo(zone)}
                                                </div>
                                            </div>
                                        </Popup>
                                    </Circle>
                                )}
                                {zone.type === 'POLYGON' && zone.points && (
                                    <Polygon
                                        positions={zone.points
                                            .sort((a, b) => a.sequence_order - b.sequence_order)
                                            .map((p) => [parseFloat(p.latitude), parseFloat(p.longitude)])}
                                        pathOptions={{
                                            color: '#00b14f',
                                            fillColor: '#00b14f',
                                            fillOpacity: 0.18,
                                            weight: 2,
                                        }}
                                    >
                                        <Popup>
                                            <div className="map-popup">
                                                <div className="map-popup__title">{zone.zone_name}</div>
                                                <div>
                                                    <b>Type:</b> Polygon
                                                </div>
                                                <div>
                                                    <b>Validity:</b> {getScheduleInfo(zone)}
                                                </div>
                                            </div>
                                        </Popup>
                                    </Polygon>
                                )}
                            </React.Fragment>
                    ))}

                    <Marker
                        key={`${deviceId}-${childStatus}`}
                        position={position}
                        icon={L.divIcon({
                            className: 'custom-marker',
                            html: `<div style="background-color: ${getStatusColor()}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.3);"></div>`,
                            iconSize: [14, 14],
                            iconAnchor: [7, 7],
                        })}
                    >
                        <Popup>
                            <div className="map-popup map-popup--child">
                                <strong>{childName || 'Child'}</strong>
                                <div className="map-popup__id">{deviceId}</div>
                                <div
                                    className={
                                        childStatus === 'DANGER'
                                            ? 'map-popup__status map-popup__status--danger'
                                            : childStatus === 'OFFLINE'
                                              ? 'map-popup__status map-popup__status--offline'
                                              : 'map-popup__status map-popup__status--ok'
                                    }
                                >
                                    {childStatus === 'SAFE'
                                        ? 'In safe zone'
                                        : childStatus === 'DANGER'
                                          ? 'Outside zone'
                                          : 'Offline'}
                                </div>
                            </div>
                        </Popup>
                    </Marker>

                    {drawType === 'POLYGON' && polygonPoints.length > 0 && (
                        <Polygon
                            positions={polygonPoints}
                            pathOptions={{ color: '#0d9488', fillColor: '#0d9488', fillOpacity: 0.22, weight: 3 }}
                        />
                    )}
                    {drawType === 'POLYGON' &&
                        mode === 'edit' &&
                        polygonPoints.map((p, idx) => (
                            <Marker
                                key={`p-${idx}`}
                                position={p}
                                draggable
                                eventHandlers={{
                                    dragend: (e) => {
                                        const newPts = [...polygonPoints];
                                        newPts[idx] = [e.target.getLatLng().lat, e.target.getLatLng().lng];
                                        setPolygonPoints(newPts);
                                    },
                                    click: () => setPolygonPoints((prev) => prev.filter((_, i) => i !== idx)),
                                }}
                                icon={L.divIcon({
                                    className: '',
                                    html: '<div style="width:11px;height:11px;background:#0d9488;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.25)"></div>',
                                    iconSize: [11, 11],
                                    iconAnchor: [5, 5],
                                })}
                            />
                        ))}
                    {drawType === 'CIRCLE' && circleCenter && (
                        <>
                            <Circle
                                center={circleCenter}
                                radius={radius}
                                pathOptions={{ color: '#dc2626', fillColor: '#fecaca', fillOpacity: 0.35, weight: 3 }}
                            />
                            <Marker
                                position={circleCenter}
                                draggable
                                eventHandlers={{
                                    dragend: (e) =>
                                        setCircleCenter([e.target.getLatLng().lat, e.target.getLatLng().lng]),
                                }}
                            />
                        </>
                    )}
                    <MapResizer />
                    <ChangeView center={position} />
                    <MapClickHandler
                        mode={mode}
                        drawType={drawType}
                        setPoints={setPolygonPoints}
                        setCircleCenter={setCircleCenter}
                    />
                </MapContainer>
            </div>
        </div>
    );
}
