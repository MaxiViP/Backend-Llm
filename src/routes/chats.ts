// src/routes/chats.ts
import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import {
	createChat,
	getChats,
	getChat,
	deleteChat,
	sendMessageStream, // ← исправлено
} from '../controllers/chatController.js'

const router = Router()

router.use(authenticate)

router.get('/', getChats)
router.post('/', createChat)
router.get('/:id', getChat)
router.delete('/:id', deleteChat)

// Обычный запрос (если где-то используется)
router.post('/:id/messages', sendMessageStream) // можно оставить для совместимости

// Основной streaming эндпоинт (используется фронтендом)
router.post('/:id/messages/stream', sendMessageStream)

export default router
