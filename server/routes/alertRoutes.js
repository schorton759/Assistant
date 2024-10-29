const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');

router.post('/alerts', alertController.createAlert);
router.get('/alerts/:phoneNumber', alertController.getAlerts);
router.put('/alerts/:alertId', alertController.updateAlert);
router.delete('/alerts/:alertId', alertController.deleteAlert);

module.exports = router;
