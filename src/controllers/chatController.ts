// src/controllers/chatController.ts
import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import Groq from 'groq-sdk'
import { spendForUsage } from './billingController.js'

const prisma = new PrismaClient()
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

// ==================== STREAMING + СПИСАНИЕ БАЛАНСА ====================
export const sendMessageStream = async (req: Request, res: Response) => {
	const { content, model = 'llama-3.3-70b-versatile' } = req.body
	const chatId = req.params.id
	const userId = (req as any).user.id

	if (!content) {
		return res.status(400).json({ error: 'Сообщение не может быть пустым' })
	}

	// Проверка владения чатом
	const chat = await prisma.chat.findUnique({ where: { id: chatId } })
	if (!chat || chat.userId !== userId) {
		return res.status(403).json({ error: 'Доступ запрещён' })
	}

	// Сохраняем сообщение пользователя
	await prisma.message.create({
		data: { chatId, role: 'user', content },
	})

	// Получаем историю чата
	const messages = await prisma.message.findMany({
		where: { chatId },
		orderBy: { createdAt: 'asc' },
	})

	const groqMessages = messages.map(m => ({
		role: m.role,
		content: m.content,
	}))

	// Списание баланса
	const estimatedCost = 1.3 // ← подстраивай стоимость здесь

	try {
		await spendForUsage(userId, estimatedCost, `Запрос к ${model}`, {
			chatId,
			model,
			messageCount: messages.length,
		})
	} catch (error: any) {
		return res.status(402).json({
			error: 'Недостаточно средств на балансе',
			needed: estimatedCost,
		})
	}

	// Streaming SSE
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

		// Сохраняем ответ ассистента
		const assistantMsg = await prisma.message.create({
			data: { chatId, role: 'assistant', content: fullResponse },
		})

		await prisma.chat.update({
			where: { id: chatId },
			data: { updatedAt: new Date() },
		})

		res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
		res.end()
	} catch (err) {
		console.error('Groq streaming error:', err)
		res.write(`data: ${JSON.stringify({ error: 'Ошибка Groq API' })}\n\n`)
		res.end()
	}
}

// Оставь остальные функции как были
export const createChat = async (req: Request, res: Response) => {
	const userId = (req as any).user.id
	const { title = 'Новый чат' } = req.body

	const chat = await prisma.chat.create({ data: { userId, title } })
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
	if (!chat || chat.userId !== (req as any).user.id) {
		return res.status(404).json({ error: 'Чат не найден' })
	}
	res.json(chat)
}

export const deleteChat = async (req: Request, res: Response) => {
	const userId = (req as any).user.id
	await prisma.chat.deleteMany({ where: { id: req.params.id, userId } })
	res.json({ success: true })
}
