const cron = require("node-cron");
const { sql } = require('../database/connection');
const AlertService = require('../services/AlertService');

/** Every minute: ACTIVE devices with no log for >90s → NOSIGNAL (parent notify ~90s–~150s after silence). */
function startHeartbeatMonitor() {
  cron.schedule("* * * * *", async () => {
    try {
      const updatedDevices = await sql`
        UPDATE devices
        SET status = 'NOSIGNAL'
        WHERE now() - last_updated > interval '90 seconds'
          AND status = 'ACTIVE'
        RETURNING *;
      `;

      if (updatedDevices.length > 0) {
        console.log(`[Heartbeat Monitor] ${updatedDevices.length} device(s) went offline.`);

        for (const device of updatedDevices) {
          try {
            await AlertService.processAlert(
              {
                user_id: device.user_id,
                device_id: device.device_id,
                child_name: device.child_name,
                latitude: device.last_lat,
                longitude: device.last_lon,
                boundary_status: device.boundary_status,
                timestamp: device.last_updated,
                updated_at: device.last_updated,
                timezone: device.timezone || 'Asia/Ho_Chi_Minh',
                isOlder: false,
                message: 'Device lost signal',
                battery: null,
                activity_type: null,
                zone_id: null,
                zone_name: null,
              },
              'OUT_OF_SIGNAL'
            );
          } catch (e) {
            console.error("[Heartbeat Monitor] Alert failed:", e.message);
          }
        }
      }
    } catch (error) {
      console.error("[Heartbeat Monitor] Database error:", error.message);
    }
  });

  console.log("Heartbeat monitor started");
}

module.exports = startHeartbeatMonitor;