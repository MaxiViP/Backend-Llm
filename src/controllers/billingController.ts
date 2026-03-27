// src/controllers/billingController.ts
import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export const spendForUsage = async (userId: string, amount: number, description: string, metadata?: any) => {
	const user = await prisma.user.findUnique({ where: { id: userId } })

	if (!user) throw new Error('Пользователь не найден')
	if (Number(user.balance) < amount) {
		const error: any = new Error('Недостаточно средств')
		error.balance = Number(user.balance)
		throw error
	}

	// Создаём транзакцию списания
	await prisma.transaction.create({
		data: {
			userId,
			amount: -amount,
			type: 'usage',
			description,
			status: 'completed',
			metadata: metadata || {},
		},
	})

	// Списываем баланс
	await prisma.user.update({
		where: { id: userId },
		data: { balance: { decrement: amount } },
	})
}

// Получить текущий баланс + последние транзакции
export const getBalance = async (req: Request, res: Response) => {
	const userId = (req as any).user.id

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { balance: true },
	})

	const transactions = await prisma.transaction.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' },
		take: 20,
	})

	res.json({
		balance: Number(user?.balance || 0),
		transactions,
	})
}
