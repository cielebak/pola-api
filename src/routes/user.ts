import { FastifyPluginAsync } from 'fastify'
import { query } from '../db.js'

const userRoutes: FastifyPluginAsync = async (app) => {
  // All routes require authentication
  app.addHook('onRequest', (app as any).authenticate)

  // PUT /user/device-token - Update APNS device token
  app.put<{ Body: { deviceToken: string } }>('/device-token', async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { deviceToken } = request.body

    if (!deviceToken) {
      return reply.code(400).send({ error: 'deviceToken is required' })
    }

    await query(
      'UPDATE users SET device_token = $2 WHERE id = $1',
      [userId, deviceToken]
    )

    return { success: true }
  })

  // GET /user/me - Get current user
  app.get('/me', async (request) => {
    const { userId } = request.user as { userId: string }

    const [user] = await query(
      'SELECT id, display_name, email, created_at FROM users WHERE id = $1',
      [userId]
    )

    return {
      id: user.id,
      displayName: user.display_name,
      email: user.email,
      createdAt: user.created_at,
    }
  })
}

export default userRoutes
