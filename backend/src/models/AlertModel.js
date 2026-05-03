// models/AlertModel.js
const { sql } = require('../database/connection');

const AlertModel = {
  async createAlert(data, type_alert) {
    const rows = await sql`
      INSERT INTO alert_logs (
        device_id, zone_id, alert_type, message,
        trigger_lat, trigger_lon, is_read, created_at, timestamp
      )
      VALUES (
        ${data.device_id},
        ${data.zone_id || null},
        ${type_alert},
        ${data.message || `${type_alert} alert`},
        ${data.latitude ?? null},
        ${data.longitude?? null},
        false, -- mặc định chưa đọc
        NOW(),
        ${data.timestamp?? null}
      )
      RETURNING *;
    `;
    return rows[0];
  },

  async getLatestByDevice(device_id) {
    const rows = await sql`
      SELECT * FROM alert_logs
      WHERE device_id = ${device_id}
      ORDER BY timestamp DESC
      LIMIT 1;
    `;
    return rows[0];
  },

  async getLatestByDevicewithBatteryLow(device_id, timestamp) {
    const rows = await sql`
      SELECT * FROM alert_logs
      WHERE device_id = ${device_id} and timestamp <= ${timestamp} and alert_type = 'BATTERY_LOW'
      ORDER BY timestamp DESC
      LIMIT 1;
    `;
    return rows[0];
  },

  async getAlertsByDevice(device_id, limit, cursor) {
    let rows;
    if (cursor) {
      rows = await sql`
        SELECT * FROM alert_logs
        WHERE device_id = ${device_id}
          AND created_at < ${cursor}
        ORDER BY created_at DESC
        LIMIT ${limit};
      `;
    } else {
      rows = await sql`
        SELECT * FROM alert_logs
        WHERE device_id = ${device_id}
        ORDER BY created_at DESC
        LIMIT ${limit};
      `;
    }
    return rows;
  },

  async getAlertsByUser(user_id, limit, cursor) {
    let rows;
    if (cursor) {
      rows = await sql`
        SELECT a.*, d.child_name, d.timezone AS device_timezone
        FROM alert_logs a
        JOIN devices d ON a.device_id = d.device_id
        WHERE d.user_id = ${user_id}
          AND d.status != 'INACTIVE'
          AND a.created_at < ${cursor}
        ORDER BY a.created_at DESC
        LIMIT ${limit};
      `;
    } else {
      rows = await sql`
        SELECT a.*, d.child_name, d.timezone AS device_timezone
        FROM alert_logs a
        JOIN devices d ON a.device_id = d.device_id
        WHERE d.user_id = ${user_id}
          AND d.status != 'INACTIVE'
        ORDER BY a.created_at DESC
        LIMIT ${limit};
      `;
    }
    return rows;
  },

  async markAsRead(alert_id) {
    const rows = await sql`
      UPDATE alert_logs
      SET is_read = true
      WHERE alert_id = ${alert_id}
      RETURNING *;
    `;
    return rows[0];
  }
};

module.exports = AlertModel;