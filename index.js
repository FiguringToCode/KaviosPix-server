const { initializeDatabase } = require('./db/db.connect')
const express = require('express')
const axios = require('axios')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const albumRoutes = require('./routes/album')
const imageRoutes = require('./routes/images')
require('dotenv').config()  

initializeDatabase()

const app = express()
const PORT = process.env.PORT || 4000

// CORS configuration
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Set-Cookie']
}))

app.use(express.json())
app.use(require('cookie-parser')())

// JWT Verification Middleware
const verifyJWT = (req, res, next) => {
    const token = req.cookies.jwt_token || req.headers.authorization?.split(' ')[1]

    if(!token){
        return res.status(401).json({error: 'No token provided'})
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        req.user = decoded
        next()
    } catch (error) {
        return res.status(401).json({error: 'Invalid or expired token'})
    }
}

// Home route
app.get('/', (req, res) => {
    res.send(`<h1>Welcome to Kavios Pix API Server.</h1>`)
})

// Initiate Google OAuth
app.get('/auth/google', (req, res) => {
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.BACKEND_URL}/auth/google/callback&response_type=code&scope=profile email`

    res.redirect(googleAuthUrl)
})

// Google OAuth Callback
app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query
    if(!code){
        return res.status(400).send("Authorization code not provided.")
    }

    try {
        // Exchange code for access token
        const params = new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri: `${process.env.BACKEND_URL}/auth/google/callback`
        })

        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', params, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        })

        const accessToken = tokenResponse.data.access_token

        // Fetch user info from Google
        const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        })

        const { email, id: userId, name, picture } = userResponse.data

        console.log('✅ User authenticated:', { email, userId, name })

        // Issue JWT with user info
        const jwtToken = jwt.sign({ 
            email, 
            userId, 
            name, 
            picture 
        }, process.env.JWT_SECRET, { expiresIn: '7d' })

        // Store JWT in httpOnly cookie
        res.cookie("jwt_token", jwtToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/'
        })

        // Redirect to frontend
        return res.redirect(`${process.env.FRONTEND_URL}/profile`)
        
    } catch (error) {
        console.error(error.response?.data || error.message)
        res.status(400).send("OAuth exchange failed.")
    }
})

// Protected Route - Get User Profile (requires JWT)
app.get('/user/profile', verifyJWT, async (req, res) => {
    try {
        res.json({
            user: {
                email: req.user.email,
                userId: req.user.userId,
                name: req.user.name,
                picture: req.user.picture
            }
        })
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' })
    }
})

// Logout endpoint
app.post('/auth/logout', (req, res) => {
    res.clearCookie('jwt_token')
    res.json({ message: 'Logged out successfully' })
})

// Verify token endpoint
app.get('/auth/verify', verifyJWT, (req, res) => {
    res.json({ valid: true, user: req.user })
})

// Album routes (with JWT middleware applied inside the router)
app.use('/albums', (req, res, next) => {
    verifyJWT(req, res, next)
}, albumRoutes)

// Image routes (with JWT middleware applied inside the router)
app.use('/albums', (req, res, next) => {
    verifyJWT(req, res, next)
}, imageRoutes)

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack)
    res.status(500).json({ error: err.message || 'Something went wrong!' })
})

app.listen(PORT, () => {
    console.log(`Server is running on PORT ${PORT}`)
})