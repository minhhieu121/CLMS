const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const AuthController = require('../controllers/AuthController');
const authMiddleware = require('../middleware/authMiddleware');
// 1. Create the Rate Limiter Middleware
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: { 
    error: 'Too many requests from this IP, please try again after 15 minutes.' 
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});


router.post('/signup', authLimiter,AuthController.signup);
router.post('/login', authLimiter, AuthController.login);
router.get('/google/start', AuthController.googleStart);
router.get('/google/callback', AuthController.googleCallback);
router.post('/logout', authMiddleware, AuthController.logout);
router.get('/profile', authMiddleware, AuthController.getProfile);
router.put('/profile', authMiddleware, AuthController.updateProfile);
router.post('/change-password', authMiddleware, AuthController.changePassword);
router.post('/password-reset/request', authLimiter, AuthController.requestPasswordReset);
router.post('/password-reset/confirm', authLimiter, AuthController.confirmPasswordReset);

module.exports = router;
