import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import Groq from 'groq-sdk'
import { spendForUsage } from './billingController.js' // ← важно импортировать

const prisma = new PrismaClient()
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

// Список доступных моделей
const availableModels = [
	'llama-3.3-70b-versatile',
	'llama3-70b-8192',
	'mixtral-8x7b-32768',
	'gemma2-9b-it',
	// добавляй новые модели сюда
]

export const createChat = async (req: Request, res: Response) => {
	/* оставь как было */
}
export const getChats = async (req: Request, res: Response) => {
	/* оставь как было */
}
export const getChat = async (req: Request, res: Response) => {
	/* оставь как было */
}
export const deleteChat = async (req: Request, res: Response) => {
	/* оставь как было */
}

// ==================== НОВЫЙ STREAMING + СПИСАНИЕ БАЛАНСА ====================
export const sendMessage = async (req: Request, res: Response) => {
	const { content, model = 'llama-3.3-70b-versatile' } = req.body
	const chatId = req.params.id
	const userId = (req as any).user.id

	// 1. Проверка модели
	if (!availableModels.includes(model)) {
		return res.status(400).json({ error: 'Недопустимая модель' })
	}

	// 2. Проверка владения чатом
	const chat = await prisma.chat.findUnique({ where: { id: chatId } })
	if (!chat || chat.userId !== userId) {
		return res.status(403).json({ error: 'Доступ запрещён' })
	}

	// 3. Сохраняем сообщение пользователя
	await prisma.message.create({
		data: { chatId, role: 'user', content },
	})

	// 4. Получаем историю чата
	const messages = await prisma.message.findMany({
		where: { chatId },
		orderBy: { createdAt: 'asc' },
	})

	const groqMessages = messages.map(m => ({
		role: m.role,
		content: m.content,
	}))

	// 5. Примерная стоимость запроса (настрой под себя)
	const estimatedCost = 1.2 // рублей за один запрос (можно сделать умнее — считать токены)

	try {
		// Списываем деньги ДО запроса к Groq
		await spendForUsage(userId, estimatedCost, `Запрос к ${model}`, {
			chatId,
			model,
			messageCount: messages.length,
		})
	} catch (error: any) {
		return res.status(402).json({
			error: 'Недостаточно средств на балансе',
			needed: estimatedCost,
			balance: error.balance || 'неизвестно',
		})
	}

	// 6. Настраиваем Server-Sent Events (Streaming)
	res.setHeader('Content-Type', 'text/event-stream')
	res.setHeader('Cache-Control', 'no-cache')
	res.setHeader('Connection', 'keep-alive')

	let fullResponse = ''

	try {
		const stream = await groq.chat.completions.create({
			model,
			messages: groqMessages,
			temperature: 0.7,
			max_tokens: 2048,
			stream: true,
		})

		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta?.content || ''
			if (delta) {
				fullResponse += delta
				res.write(`data: ${JSON.stringify({ delta })}\n\n`)
			}
		}

		// 7. Сохраняем полный ответ ассистента
		const assistantMsg = await prisma.message.create({
			data: {
				chatId,
				role: 'assistant',
				content: fullResponse,
			},
		})

		// Обновляем время последнего сообщения в чате
		await prisma.chat.update({
			where: { id: chatId },
			data: { updatedAt: new Date() },
		})

		res.write(`data: ${JSON.stringify({ done: true, message: assistantMsg })}\n\n`)
		res.end()
	} catch (err) {
		console.error('Groq streaming error:', err)
		res.write(`data: ${JSON.stringify({ error: 'Ошибка при получении ответа от Groq' })}\n\n`)
		res.end()
	}
}
