const { sql } = require('../database/connection');

class Log {
    static async create(logData, zone_id = null, zone_name = null, boundary_status=null) {
        const { device_id, timestamp, latitude, longitude, accuracy, speed, heading, altitude, odometer, battery_level, activity_type } = logData;
        
        const [result] = await sql`
            INSERT INTO device_logs (
                device_id, timestamp, latitude, longitude, accuracy, 
                speed, heading, altitude, odometer, battery_level, activity_type, zone_id, zone_name, boundary_status
            ) VALUES (
                ${device_id}, ${timestamp}, ${latitude}, ${longitude}, ${accuracy}, 
                ${speed}, ${heading}, ${altitude}, ${odometer}, ${battery_level}, ${activity_type}, ${zone_id}, ${zone_name}, ${boundary_status}
            )
            RETURNING log_id;
        `;

        return result.log_id;
    }
    static async getLatestbyID(device_id) {        
        const [result] = await sql`
            SELECT *
            FROM device_logs
            WHERE device_id = ${device_id}
            ORDER BY timestamp DESC
            LIMIT 1
        `;

        return result;
    }

    static async getLatestbyTimeStamp(device_id, timestamp) {        
        const [result] = await sql`
            SELECT *
            FROM device_logs
            WHERE device_id = ${device_id} and timestamp < ${timestamp}
            ORDER BY timestamp DESC
            LIMIT 1
        `;

        return result;
    }
    static async getLogsByDevice(
        device_id,
        from = null,
        to = null,
        limit = 100,
        cursor = null
    ) {
        const parsedLimit = Number(limit) || 100;
        const results = await sql`
            SELECT *
            FROM device_logs
            WHERE device_id = ${device_id}
            ${from ? sql`AND timestamp >= ${from}::timestamptz` : sql``}
            ${to ? sql`AND timestamp <= ${to}::timestamptz` : sql``}
            ${cursor ? sql`AND timestamp < ${cursor}::timestamptz` : sql``}
            ORDER BY timestamp ASC
            LIMIT ${parsedLimit}
        `;

        return results;
    }


}

module.exports = Log;
