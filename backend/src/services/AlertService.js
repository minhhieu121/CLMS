const AlertModel = require('../models/AlertModel')
const DeviceModel = require('../models/DeviceModel')
const LocalMegaphone = require('../services/LocalMegaphone');
const { validate: validateUUID } = require('uuid');
const { DateTime } = require('luxon');
const formatAlertDates = (alert, timezone) => {
    if (!alert) return alert;

    const tz = timezone || 'UTC';

    if (alert.created_at) {
        alert.created_at = DateTime.fromJSDate(alert.created_at)
            .setZone(tz)
            .toLocaleString(DateTime.DATETIME_MED);
    }
    return alert;
};

const DUPLICATE_AFTER_LAST_MS_BATTERY = 2 * 60 * 1000;

const AlertService = {
    processAlert: async (data, type_alert) => {   
        const {latestLogbyTime} = data;
        if (type_alert == null){
            if (data.boundary_status == "OUTSIDE") type_alert = "EXIT"
            if (data.boundary_status == "INSIDE") type_alert = "ENTER"
        }
        if (type_alert == "OUT_OF_SIGNAL"){
            // One transition ACTIVE→NOSIGNAL per cron flip; dedup is at DB/cron level.
        }
        //After alert service done analyse then can emit to WS with new LOG, old alrt do not WS

        //For battery_low, get the latest battery low log. 
        if (type_alert == "BATTERY_LOW"){
            const latestAlert = await AlertModel.getLatestByDevicewithBatteryLow(data.device_id, data.timestamp);
            
            const logTs = data.timestamp.getTime();
            const lastAlertMs = latestAlert?.timestamp
                ? new Date(latestAlert.timestamp).getTime()
                : null;

            if (latestAlert && (logTs - lastAlertMs) < DUPLICATE_AFTER_LAST_MS_BATTERY) {
                return;
            }
        }

        const newAlert = await AlertModel.createAlert(data, type_alert);
        if (!newAlert){
            throw new Error("Can not create new alert"); 
        }
        const owner = await DeviceModel.findbyID(data.device_id);
        const user_id = data.user_id ?? owner?.user_id;
        if (!data.isOlder){
            LocalMegaphone.emit(type_alert, {
                user_id,
                device_id: data.device_id,
                child_name: data.child_name,
                timezone: data.timezone,
                latitude: data.latitude,
                longitude: data.longitude,
                battery: data.battery,
                zone_id: data.zone_id,
                zone_name: data.zone_name,
                timestamp: data.timestamp,
                activity_type: data.activity_type,
                boundary_status: data.boundary_status,
            });
        }
        return true;
    },
    getLatestAlertbyDevice: async (device_id, user_id) => {
        if (!validateUUID(device_id)) {
            throw new Error("Invalid UUID");
        }
        
        const device = await DeviceModel.findbyID(device_id);
        if (!device) {
            throw new Error("Device not found");
        }
        if (device.user_id !== user_id) {
            throw new Error("Not authorized to view this device");
        }
        let latestAlert = await AlertModel.getLatestByDevice(device_id);
        if (!latestAlert) {
            throw new Error("No logs found for this device");
        }
        latestAlert.created_at = DateTime.fromJSDate(latestAlert.created_at).setZone( device.timezone).toLocaleString(DateTime.DATETIME_MED);
        return latestAlert;
    },

    getAlertsbyDevice: async (device_id, user_id, options = {}) => {
        const { limit = 20, cursor } = options;

        if (!validateUUID(device_id)) {
            throw new Error("Invalid UUID");
        }

        const safeLimit = Math.min(limit, 50);

        const device = await DeviceModel.findbyID(device_id);
        if (!device) {
            throw new Error("Device not found");
        }
        if (device.user_id !== user_id) {
            throw new Error("Not authorized to view this device");
        }

        const alerts = await AlertModel.getAlertsByDevice(
            device_id,
            safeLimit,
            cursor ? new Date(cursor) : null
        );

        const nextCursor =
            alerts.length > 0
                ? alerts[alerts.length - 1].created_at.toISOString()
                : null;

        const formattedAlerts = alerts.map(alerts =>
            formatAlertDates(alerts, device.timezone)
        );

        

        return {
            alerts: formattedAlerts,
            nextCursor,
        };
    },
    getAlertsbyUser: async (user_id, options = {}) => {
        const { limit = 20, cursor } = options;


        const safeLimit = Math.min(limit, 50);


        const alerts = await AlertModel.getAlertsByUser(
            user_id,
            safeLimit,
            cursor ? new Date(cursor) : null
        );

        const nextCursor =
            alerts.length > 0
                ? alerts[alerts.length - 1].created_at.toISOString()
                : null;

        const formattedAlerts = alerts.map((a) =>
            formatAlertDates(a, a.device_timezone)
        );

        

        return {
            alerts: formattedAlerts,
            nextCursor,
        };
    }
      
};

LocalMegaphone.on('DEVICE_ALERT', async (event) => {
    try {
        await AlertService.processAlert(event, null);  
    } catch (error) {
        console.error("Failed to process local event:", error);
    }
});
LocalMegaphone.on('DEVICE_BATTERY_LOW', async (event) => {
    try {
        await AlertService.processAlert(event, "BATTERY_LOW");  
    } catch (error) {
        console.error("Failed to process local event:", error);
    }
});
module.exports = AlertService; 