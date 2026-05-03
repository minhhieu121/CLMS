/**
 * Subscribes to geofence / signal alerts on LocalMegaphone and notifies parents
 * via email (optional SMTP) and OneSignal web push (optional REST keys).
 */
const LocalMegaphone = require('./LocalMegaphone');
const UserModel = require('../models/UserModel');
const { sendAlertEmail } = require('./MailService');
const { sendParentAlertPush } = require('./OneSignalService');

function toDate(value) {
  if (!value) return new Date();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Normalize megaphone payloads into MailService.sendAlertEmail shape */
function toMailEvent(event) {
  const battery = event.battery;
  let batteryLevel = null;
  if (battery != null && battery !== '') {
    const n = Number(battery);
    batteryLevel = n <= 1 && n >= 0 ? Math.round(n * 100) : Math.round(n);
  }

  return {
    device_id: event.device_id,
    child_name: event.child_name,
    timestamp: toDate(event.timestamp ?? event.updated_at),
    lat: event.latitude ?? event.lat,
    lon: event.longitude ?? event.lon,
    battery_level: batteryLevel,
    activity_type: event.activity_type,
    timezone: event.timezone || 'UTC',
  };
}

async function notifyParentChannels(userId, type, event) {
  let user;
  try {
    user = await UserModel.findById(userId);
  } catch (e) {
    console.error('[ParentAlertNotifier] Failed to load user:', e.message);
    return;
  }
  if (!user) return;

  const mailEvent = toMailEvent(event);
  const child = event.child_name || 'Child';
  const zone = event.zone_name ? ` (${event.zone_name})` : '';

  let pushTitle;
  let pushMessage;

  if (type === 'EXIT') {
    pushTitle = 'Safe zone alert';
    pushMessage = `${child} left the safe zone${zone}. Open CLMS to view location.`;
  } else if (type === 'ENTER') {
    pushTitle = 'Back in safe zone';
    pushMessage = `${child} entered the safe zone${zone}.`;
  } else if (type === 'OUT_OF_SIGNAL') {
    pushTitle = 'Device offline';
    pushMessage = `Lost signal from ${child}'s device. Last known location may be stale.`;
  } else {
    pushTitle = 'CLMS alert';
    pushMessage = `Alert for ${child}.`;
  }

  try {
    const pushResult = await sendParentAlertPush(userId, {
      title: pushTitle,
      message: pushMessage,
    });
    if (pushResult?.skipped) {
      console.warn('[ParentAlertNotifier] OneSignal skipped:', pushResult.reason);
    }
  } catch (e) {
    console.error('[ParentAlertNotifier] OneSignal error:', e.message);
  }

  // Email for higher-severity cases only (avoid inbox spam on ENTER)
  if (type === 'EXIT' || type === 'OUT_OF_SIGNAL') {
    try {
      await sendAlertEmail({
        to: user.email,
        fname: user.fname,
        event: mailEvent,
        alertType: type,
      });
    } catch (e) {
      console.error('[ParentAlertNotifier] Email error:', e.message);
    }
  }
}

LocalMegaphone.on('EXIT', (event) => {
  const uid = event.user_id;
  if (!uid) return;
  notifyParentChannels(uid, 'EXIT', event).catch((e) =>
    console.error('[ParentAlertNotifier] EXIT handler:', e)
  );
});

LocalMegaphone.on('ENTER', (event) => {
  const uid = event.user_id;
  if (!uid) return;
  notifyParentChannels(uid, 'ENTER', event).catch((e) =>
    console.error('[ParentAlertNotifier] ENTER handler:', e)
  );
});

LocalMegaphone.on('OUT_OF_SIGNAL', (event) => {
  const uid = event.user_id;
  if (!uid) return;
  notifyParentChannels(uid, 'OUT_OF_SIGNAL', event).catch((e) =>
    console.error('[ParentAlertNotifier] OUT_OF_SIGNAL handler:', e)
  );
});
LocalMegaphone.on('BATTERY_LOW', (event) => {
  const uid = event.user_id;
  if (!uid) return;
  notifyParentChannels(uid, 'BATTERY_LOW', event).catch((e) =>
    console.error('[ParentAlertNotifier] BATTERY_LOW handler:', e)
  );
});

module.exports = {};
