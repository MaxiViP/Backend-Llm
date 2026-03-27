// src/routes/billing.ts
import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { getBalance } from '../controllers/billingController.js'

const router = Router()

router.use(authenticate)
router.get('/balance', getBalance)

export default router
