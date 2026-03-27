import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const prisma = new PrismaClient()

const generateToken = (user: any) => {
	return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET!, { expiresIn: '30d' })
}

// ====================== REGISTER ======================
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
			balance: 100,
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
// ====================== SUPERUSER LOGIN ======================
export const loginSuperuser = async (req: Request, res: Response) => {
	try {
		const superEmail = process.env.SUPERUSER_EMAIL || 'super@example.com'

		let user = await prisma.user.findUnique({ where: { email: superEmail } })

		if (!user) {
			user = await prisma.user.create({
				data: {
					email: superEmail,
					name: 'Superuser',
					balance: 1000,
					provider: 'system',
				},
			})
			console.log(`Создан суперпользователь: ${superEmail}`)
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
	} catch (error) {
		console.error('Ошибка входа суперпользователя:', error)
		res.status(500).json({ error: 'Внутренняя ошибка сервера' })
	}
}

// ====================== LOGIN (оставляем для dev) ======================
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
	})

	if (!user) return res.status(404).json({ error: 'Пользователь не найден' })

	res.json({
		...user,
		balance: Number(user.balance),
	})
}

// ====================== SEND CODE ======================
export const sendCode = async (req: Request, res: Response) => {
	const { email } = req.body

	if (!email) {
		return res.status(400).json({ error: 'Email обязателен' })
	}

	// 🚨 анти-спам (30 сек)
	const lastCode = await prisma.emailCode.findFirst({
		where: { email },
		orderBy: { createdAt: 'desc' },
	})

	if (lastCode && Date.now() - new Date(lastCode.createdAt).getTime() < 30_000) {
		return res.status(429).json({ error: 'Подождите перед повторной отправкой' })
	}

	const code = Math.floor(100000 + Math.random() * 900000).toString()

	await prisma.emailCode.deleteMany({ where: { email } })

	await prisma.emailCode.create({
		data: {
			email,
			code,
			expiresAt: new Date(Date.now() + 5 * 60 * 1000),
		},
	})

	console.log(`📧 CODE for ${email}: ${code}`)

	res.json({ success: true })
}

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

// ====================== VERIFY CODE ======================
export const verifyCode = async (req: Request, res: Response) => {
	const { email, code } = req.body

	if (!email || !code) {
		return res.status(400).json({ error: 'Email и код обязательны' })
	}

	const record = await prisma.emailCode.findFirst({
		where: { email, code },
		orderBy: { createdAt: 'desc' },
	})

	if (!record || record.expiresAt < new Date()) {
		return res.status(400).json({ error: 'Неверный или истёкший код' })
	}

	await prisma.emailCode.deleteMany({ where: { email } })

	let user = await prisma.user.findUnique({ where: { email } })

	if (!user) {
		user = await prisma.user.create({
			data: {
				email,
				name: email.split('@')[0],
				balance: 100,
			},
		})
	}

	const token = generateToken(user)

	res.json({
		user: {
			id: user.id,
			email: user.email,
			name: user.name,
			balance: Number(user.balance),
			provider: 'email',
		},
		token,
	})
}
