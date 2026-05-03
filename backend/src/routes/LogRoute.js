const express = require('express');
const router = express.Router();
const LogController = require('../controllers/LogController');
const validateDeviceId = require("../middleware/validateDeviceId");
const authMiddleware = require('../middleware/authMiddleware');
const validateTraccarSecret = require('../middleware/validateTraccarSecret');

router.post('/traccar', validateTraccarSecret, LogController.saveLog);

// 2. Lấy vị trí mới nhất của 1 thiết bị
router.get(
    "/latest/:device_id",
    authMiddleware,
    validateDeviceId,
    LogController.getLatestLogbyDevice
);
router.get('/history/:device_id', authMiddleware, validateDeviceId, LogController.getLogsByDevice);

module.exports = router;