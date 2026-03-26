import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { createChat, getChats, getChat, deleteChat, sendMessage } from '../controllers/chatController.js'

const router = Router()

router.use(authenticate)

router.get('/', getChats)
router.post('/', createChat)
router.get('/:id', getChat)
router.delete('/:id', deleteChat)
router.post('/:id/messages', sendMessage)

export default router
