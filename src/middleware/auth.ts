import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

declare global {
	namespace Express {
		interface Request {
			user?: any
		}
	}
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
	const token = req.headers.authorization?.split(' ')[1]
	if (!token) return res.status(401).json({ error: 'Нет токена' })

	try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET!)
		req.user = decoded
		next()
	} catch (err) {
		res.status(401).json({ error: 'Неверный токен' })
	}
}
