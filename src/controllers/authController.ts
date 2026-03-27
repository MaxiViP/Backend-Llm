import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const prisma = new PrismaClient()

const generateToken = (user: any) => {
	return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET!, { expiresIn: '30d' })
}

// ====================== РЕГИСТРАЦИЯ ======================
export const register = async (req: Request, res: Response) => {
	const { email, password, name } = req.body

	if (!email || !password) {
		return res.status(400).json({ error: 'Email и пароль обязательны' })
	}

	const existing = await prisma.user.findUnique({ where: { email } })
	if (existing) {
		return res.status(409).json({ error: 'Пользователь уже существует' })
	}

	const hashedPassword = await bcrypt.hash(password, 12)

	const user = await prisma.user.create({
		data: {
			email,
			password: hashedPassword,
			name: name || email.split('@')[0],
			balance: 100, // стартовый бонус
		},
	})

	const token = generateToken(user)
	res.status(201).json({
		user: {
			id: user.id,
			email: user.email,
			name: user.name,
			balance: Number(user.balance),
			provider: null,
		},
		token,
	})
}

// ====================== ЛОГИН ======================
export const login = async (req: Request, res: Response) => {
	const { email, password } = req.body

	const user = await prisma.user.findUnique({ where: { email } })

	if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
		return res.status(401).json({ error: 'Неверный email или пароль' })
	}

	const token = generateToken(user)
	res.json({
		user: {
			id: user.id,
			email: user.email,
			name: user.name,
			balance: Number(user.balance),
			provider: user.provider,
		},
		token,
	})
}

// ====================== GET ME ======================
export const getMe = async (req: Request, res: Response) => {
	const userId = (req as any).user?.id
	if (!userId) return res.status(401).json({ error: 'Не авторизован' })

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			email: true,
			name: true,
			avatarUrl: true,
			balance: true,
			provider: true,
			twoFactorEnabled: true,
		},
	})

	if (!user) return res.status(404).json({ error: 'Пользователь не найден' })

	res.json({
		...user,
		balance: Number(user.balance),
	})
}

// ====================== GOOGLE CALLBACK ======================
export const googleCallback = async (profile: any, req: Request, res: Response) => {
	const email = profile.emails?.[0]?.value
	const name = profile.displayName
	const avatarUrl = profile.photos?.[0]?.value
	const providerId = profile.id

	if (!email) {
		return res.redirect(`${process.env.FRONTEND_URL}/auth?error=no_email`)
	}

	let user = await prisma.user.findFirst({
		where: { OR: [{ providerId }, { email }] },
	})

	if (!user) {
		user = await prisma.user.create({
			data: {
				email,
				name,
				avatarUrl,
				provider: 'google',
				providerId,
				balance: 100,
			},
		})
	}

	const token = generateToken(user)
	res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`)
}
