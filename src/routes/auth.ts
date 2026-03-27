import { Router } from 'express'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import {
	register,
	login,
	getMe,
	googleCallback,
	sendCode,
	verifyCode,
	loginSuperuser,
} from '../controllers/authController.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

// ====================== GOOGLE STRATEGY ======================
passport.use(
	new GoogleStrategy(
		{
			clientID: process.env.GOOGLE_CLIENT_ID!,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
			callbackURL: process.env.GOOGLE_CALLBACK_URL!,
		},
		(accessToken, refreshToken, profile, done) => {
			done(null, profile)
		},
	),
)

// ====================== AUTH ROUTES ======================
router.post('/register', register)
router.post('/login', login)
router.post('/superuser', loginSuperuser)
// ====================== EMAIL OTP ======================
router.post('/send-code', sendCode)
router.post('/verify-code', verifyCode)

// ====================== GET CURRENT USER ======================
router.get('/me', authenticate, getMe)

// ====================== GOOGLE OAUTH ======================
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))

router.get('/google/callback', passport.authenticate('google', { session: false }), (req, res) => {
	const profile = req.user as any
	googleCallback(profile, req, res)
})

export default router
