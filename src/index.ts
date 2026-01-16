import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { db, initDb } from './db.js'
import authRoutes from './routes/auth.js'
import babiesRoutes from './routes/babies.js'
import activitiesRoutes from './routes/activities.js'
import invitationsRoutes from './routes/invitations.js'
import userRoutes from './routes/user.js'

const app = Fastify({ logger: true })

// Plugins
await app.register(cors, { origin: true })
await app.register(jwt, { secret: process.env.JWT_SECRET || 'dev-secret-change-me' })

// Auth decorator
app.decorate('authenticate', async (request: any, reply: any) => {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized' })
  }
})

// Routes
await app.register(authRoutes, { prefix: '/api/v1/auth' })
await app.register(userRoutes, { prefix: '/api/v1/user' })
await app.register(babiesRoutes, { prefix: '/api/v1/babies' })
await app.register(activitiesRoutes, { prefix: '/api/v1' })
await app.register(invitationsRoutes, { prefix: '/api/v1/invitations' })

// Health check
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

// Invite redirect (Universal Link landing)
app.get('/pola/invite/:code', async (request, reply) => {
  const { code } = request.params as { code: string }
  // Redirect to app or show landing page
  reply.redirect(`pola://invite/${code}`)
})

// Start
const start = async () => {
  try {
    await initDb()
    const port = parseInt(process.env.PORT || '3000')
    await app.listen({ port, host: '0.0.0.0' })
    console.log(`🚀 Pola API running on port ${port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
