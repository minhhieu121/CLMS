const LogService = require('../services/LogService');
const { validateLogPayload } = require("../dto/logDTO");

const LogController = {
    saveLog: async (req, res) => { 
        try {
            if (process.env.LOG_TRACCAR_PAYLOAD === '1' || process.env.LOG_TRACCAR_PAYLOAD === 'true') {
                console.log('[Traccar /log/traccar] raw body:', JSON.stringify(req.body, null, 2));
            }

            const data = await validateLogPayload(req.body);
            
            await LogService.processLog(data);

            return res.status(201).json({ success: true });
        } catch (err) {
            console.error("Error saving log:", err);
            const isValidation =
                err?.name === 'ValidationError' ||
                /invalid|required|must be/i.test(String(err.message || ''));
            const status = isValidation ? 400 : 500;
            return res.status(status).json({ error: err.message });
        } 
    },

    getLatestLogbyDevice: async (req, res) => { 
        try {
            const userId = req.user.user_id;

            const device_id = req.params.device_id; 
            
            if (!device_id) {
                return res.status(400).json({ message: "Device ID is required" });
            }

            const latestLog = await LogService.getLatestbyID(device_id, userId);

            return res.status(200).json({ 
                success: true,
                data: latestLog
            });
            
        } catch (err) {
            console.error("Error fetching latest log:", err);
            return res.status(500).json({error: err.message }); 
        } 
    },
    getLogsByDevice: async (req, res, next) => {
        try {
            const { device_id } = req.params;
            const user_id = req.user.user_id;

            const {
                from,
                to,
                limit = 100,
                cursor
            } = req.query;

            const result = await LogService.getLogsByDevice(
                device_id,
                user_id,
                {
                    from,
                    to,
                    limit: Number(limit),
                    cursor
                }
            );

            res.json(result);
        } catch (err) {
        next(err);
        }
    }
};

module.exports = LogController;