const { sql } = require('../database/connection');
const { validate: validateUUID } = require('uuid');

class Device {
    static async findbyID(device_id) {
        const [result] = await sql`
            SELECT *
            FROM devices
            WHERE device_id = ${device_id}
        `;

        return result || null;
    }
    static async updateDevice(data, boundary_status, device_status) {
        const { timestamp, latitude, longitude, device_id } = data;

        const updates = {
            last_lat: latitude,
            last_lon: longitude,
            last_updated: timestamp
        };

        // Only update if value exists
        if (boundary_status !== undefined && boundary_status !== null) {
            updates.boundary_status = boundary_status;
        }

        // DB column is `status` (ACTIVE | INACTIVE | NOSIGNAL), not device_status
        if (device_status !== undefined && device_status !== null) {
            updates.status = device_status;
        }

        const [result] = await sql`
            UPDATE devices
            SET ${sql(updates)}
            WHERE device_id = ${device_id}
            AND status != 'INACTIVE'
            RETURNING *;
        `;

        return result || null;
    }
    static async activeDevice(device_id) {
        const [result] = await sql`
            UPDATE devices
            SET 
            status = 'ACTIVE'
            WHERE device_id = ${device_id} 
            AND status != 'ACTIVE'
            RETURNING *;
        `;

        return result || null;
    }
    static async changeBoundaryStatusDevice(device_id, boundary_status) {
        const [result] = await sql`
            UPDATE devices
            SET 
                boundary_status = ${boundary_status}
            WHERE device_id = ${device_id} 
            AND status != 'INACTIVE'
            RETURNING *;
        `;

        return result || null;
    }
    static async statusbyID(device_id) {
        const [result] = await sql`
            SELECT status
            FROM devices 
            WHERE device_id = ${device_id}
        `;

        return result || null;
    }

    static async addDevice(data) {
        try {
            const { userId, childName, timezone, deviceId } = data;

            if (deviceId) {
                if (!validateUUID(deviceId)) {
                    throw new Error('Invalid device UUID');
                }
                const [result] = await sql`
                    INSERT INTO devices (device_id, user_id, child_name, timezone)
                    VALUES (${deviceId}::uuid, ${userId}, ${childName}, ${timezone})
                    RETURNING *;
                `;
                return result || null;
            }

            const [result] = await sql`
                INSERT INTO devices (user_id, child_name, timezone)
                VALUES (${userId}, ${childName}, ${timezone})
                RETURNING *;
            `;
            return result || null;
        } catch (error) {
            console.error("❌ DB Error in addDevice:", error);
            throw error; 
        }
    }

    static async updateForUser(userId, deviceId, fields) {
        if (!validateUUID(deviceId)) {
            throw new Error('Invalid device UUID');
        }
        const updates = {};
        if (fields.childName !== undefined) updates.child_name = fields.childName;
        if (fields.timezone !== undefined) updates.timezone = fields.timezone;
        if (Object.keys(updates).length === 0) {
            return Device.findbyID(deviceId);
        }
        const [result] = await sql`
            UPDATE devices
            SET ${sql(updates)}
            WHERE device_id = ${deviceId}::uuid AND user_id = ${userId}
            AND status != 'INACTIVE'
            RETURNING *;
        `;
        return result || null;
    }

    static async softDeleteForUser(userId, deviceId) {
        if (!validateUUID(deviceId)) {
            throw new Error('Invalid device UUID');
        }
        const [result] = await sql`
            UPDATE devices
            SET status = 'INACTIVE'
            WHERE device_id = ${deviceId}::uuid AND user_id = ${userId}
            RETURNING *;
        `;
        return result || null;
    }
    static async getActiveDevices(userId) {
        try {
            const rows = await sql`
                SELECT * 
                FROM devices 
                WHERE user_id = ${userId} AND status != 'INACTIVE'
            `;
            
            if (!rows || rows.length === 0) {
                console.log(`No active devices found for user: ${userId}`);
                return [];
            }
                
            return rows;
            
        } catch (error) {
            console.error("❌ DB Error in getActiveDevices:", error);
            return [];
        }
    }
    static async getDevices(userId) {
        try {
            const rows = await sql`
                SELECT * 
                FROM devices 
                WHERE user_id = ${userId} 
                ORDER BY (status = 'ACTIVE') DESC
            `;
            
            if (!rows || rows.length === 0) {
                console.log(`No active devices found for user: ${userId}`);
                return [];
            }
                
            return rows;
            
        } catch (error) {
            console.error("❌ DB Error in getActiveDevices:", error);
            return [];
        }
    }
}



module.exports = Device;
