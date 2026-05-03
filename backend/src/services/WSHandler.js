const jwt = require('jsonwebtoken');
const DeviceModel = require('../models/DeviceModel');
const LocalMegaphone = require('../services/LocalMegaphone'); 
const { DateTime } = require('luxon');

module.exports = (io) => { 
    
    // ==========================================
    // PART 1: THE LOCAL LISTENER 
    // ==========================================
    LocalMegaphone.on('DEVICE_UPDATES', (event) => {
        try {
            if (event.isOlder) return;
            const roomName = `room_device_${event.device_id}`;            
            event.timestamp = DateTime.fromJSDate(event.timestamp).toUTC().toISO();
            io.to(roomName).emit('location_update', event);
            
        } catch (error) {
            console.error("Failed to process local event:", error);
        }
    });
    LocalMegaphone.on('EXIT', (event) => {
        try {
            const roomName = `room_device_${event.device_id}`;
            event.timestamp = DateTime.fromJSDate(event.timestamp).setZone( event.timezone).toLocaleString(DateTime.DATETIME_MED);
            io.to(roomName).emit('alert_device_out_of_zone', event);
        } catch (error) {
            console.error("Failed to process local event:", error);
        }
    });
    LocalMegaphone.on('ENTER', (event) => {
        try {
            const roomName = `room_device_${event.device_id}`;
            event.timestamp = DateTime.fromJSDate(event.timestamp).setZone( event.timezone).toLocaleString(DateTime.DATETIME_MED);
            io.to(roomName).emit('alert_device_enter_of_zone', event);
        } catch (error) {
            console.error("Failed to process local event:", error);
        }
    });
    LocalMegaphone.on('BATTERY_LOW', (event) => {
        try {
            const roomName = `room_device_${event.device_id}`;
            event.timestamp = DateTime.fromJSDate(event.timestamp).setZone( event.timezone).toLocaleString(DateTime.DATETIME_MED);
            io.to(roomName).emit('alert_device_battery_low', event);
        } catch (error) {
            console.error("Failed to process local event:", error);
        }
    });
    LocalMegaphone.on('OUT_OF_SIGNAL', async (event) => {
        try {
            const roomName = `room_device_${event.device_id}`;
            const tz = event.timezone && String(event.timezone).trim() ? event.timezone : 'UTC';
            const t = event.updated_at ?? event.timestamp;
            if (t != null && t !== '') {
                try {
                    const dt = t instanceof Date ? t : new Date(t);
                    if (!Number.isNaN(dt.getTime())) {
                        event.updated_at = DateTime.fromJSDate(dt).setZone(tz).toLocaleString(DateTime.DATETIME_MED);
                    }
                } catch (e) {
                    console.warn('[WS] OUT_OF_SIGNAL time format skipped:', e.message);
                }
            }
            io.to(roomName).emit('alert_device_out_of_signal', event);
        } catch (error) {
            console.error("Failed to process OUT_OF_SIGNAL:", error);
        }
    });


    // ==========================================
    // PART 2: SOCKET SECURITY & ROOM ROUTING
    // ==========================================
    const getCookie = (cookieString, cookieName) => {
        if (!cookieString) return null;
        const match = cookieString.match(new RegExp('(^| )' + cookieName + '=([^;]+)'));
        if (match) return match[2];
        return null;
    };
    io.use(async (socket, next) => {
        try {
            const cookieName = process.env.AUTH_COOKIE_NAME || 'clms_access_token';
            const token = socket.handshake.headers.token || getCookie(socket.handshake.headers.cookie, cookieName);
            if (!token) throw new Error("No token provided");
            
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            let userDevices = await DeviceModel.getActiveDevices(decoded.user_id);
            userDevices = userDevices.map(device => String(device.device_id));
            socket.allowedDevices = userDevices;     
            next(); 
            
        } catch (err) {
            console.log("Blocked unauthorized connection attempt.");
            next(new Error("Authentication error: Invalid Token"));
        }
    });

    io.on('connection', (socket) => {
        console.log(`🟢 Parent Connected! Socket: ${socket.id}`);
        if (socket.allowedDevices && socket.allowedDevices.length > 0) {
            socket.allowedDevices.forEach(deviceId => {
                const roomName = `room_device_${deviceId}`;
                socket.join(roomName);
                console.log(`   ↳ Socket securely joined: ${roomName}`);
            });
        } else {
            console.log(`   ↳ Warning: Parent connected but has no assigned devices.`);
        }

        socket.on('disconnect', () => {
            console.log(`🔴 Parent disconnected. Socket: ${socket.id}`);
        });
    });
};