import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export const createChat = async (req: Request, res: Response) => {
	const userId = (req as any).user.id
	const { title = 'Новый чат' } = req.body

	const chat = await prisma.chat.create({
		data: { userId, title },
	})
	res.json(chat)
}

export const getChats = async (req: Request, res: Response) => {
	const userId = (req as any).user.id
	const chats = await prisma.chat.findMany({
		where: { userId },
		orderBy: { updatedAt: 'desc' },
		include: { messages: { take: 1, orderBy: { createdAt: 'desc' } } },
	})
	res.json(chats)
}

export const getChat = async (req: Request, res: Response) => {
	const chat = await prisma.chat.findUnique({
		where: { id: req.params.id },
		include: { messages: { orderBy: { createdAt: 'asc' } } },
	})
	if (!chat || chat.userId !== (req as any).user.id) return res.status(404).json({ error: 'Чат не найден' })
	res.json(chat)
}

export const deleteChat = async (req: Request, res: Response) => {
	const userId = (req as any).user.id
	await prisma.chat.deleteMany({ where: { id: req.params.id, userId } })
	res.json({ success: true })
}

// Главный эндпоинт — отправка сообщения + вызов Groq
export const sendMessage = async (req: Request, res: Response) => {
	const { content, model = 'llama3-70b-8192' } = req.body
	const chatId = req.params.id
	const userId = (req as any).user.id

	// проверка владения чатом
	const chat = await prisma.chat.findUnique({ where: { id: chatId } })
	if (!chat || chat.userId !== userId) return res.status(403).json({ error: 'Доступ запрещён' })

	// сохраняем сообщение пользователя
	await prisma.message.create({
		data: { chatId, role: 'user', content },
	})

	// получаем всю историю чата
	const messages = await prisma.message.findMany({
		where: { chatId },
		orderBy: { createdAt: 'asc' },
	})

	// формируем payload для Groq (OpenAI-совместимый формат)
	const groqMessages = messages.map(m => ({
		role: m.role,
		content: m.content,
	}))

	try {
		const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model,
				messages: groqMessages,
				temperature: 0.7,
				max_tokens: 1024,
			}),
		})

		const data = await response.json()
		const assistantContent = data.choices?.[0]?.message?.content || 'Ошибка ответа'

		// сохраняем ответ ассистента
		const assistantMsg = await prisma.message.create({
			data: { chatId, role: 'assistant', content: assistantContent },
		})

		// обновляем updatedAt чата
		await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } })

		res.json(assistantMsg)
	} catch (err) {
		console.error(err)
		res.status(500).json({ error: 'Ошибка Groq API' })
	}
}
