import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export const getBalance = async (req: Request, res: Response) => {
	const userId = (req as any).user.id
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { balance: true, transactions: { orderBy: { createdAt: 'desc' }, take: 50 } },
	})

	res.json({
		balance: Number(user?.balance || 0),
		transactions: user?.transactions || [],
	})
}

export const deposit = async (req: Request, res: Response) => {
	const userId = (req as any).user.id
	const { amount, method } = req.body // amount в рублях

	if (!amount || amount <= 0) return res.status(400).json({ error: 'Неверная сумма' })

	const transaction = await prisma.transaction.create({
		data: {
			userId,
			amount,
			type: 'deposit',
			description: `Пополнение через ${method || 'card'}`,
			status: 'completed',
		},
	})

	const user = await prisma.user.update({
		where: { id: userId },
		data: { balance: { increment: amount } },
	})

	res.json({ success: true, newBalance: Number(user.balance), transaction })
}

// Списание за использование (будет вызываться из chatController)
export const spendForUsage = async (userId: string, amount: number, description: string, metadata?: any) => {
	const user = await prisma.user.findUnique({ where: { id: userId } })
	if (!user || Number(user.balance) < amount) {
		throw new Error('Недостаточно средств')
	}

	await prisma.transaction.create({
		data: {
			userId,
			amount: -amount,
			type: 'usage',
			description,
			status: 'completed',
			metadata,
		},
	})

	await prisma.user.update({
		where: { id: userId },
		data: { balance: { decrement: amount } },
	})
}
