import { FastifyPluginAsync } from 'fastify'
import { queryOne, query } from '../db.js'

interface LoginBody {
  appleUserId: string
  displayName?: string
  email?: string
}

const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /auth/login - Login or register with Apple ID
  app.post<{ Body: LoginBody }>('/login', async (request, reply) => {
    const { appleUserId, displayName, email } = request.body

    if (!appleUserId) {
      return reply.code(400).send({ error: 'appleUserId is required' })
    }

    // Try to find existing user
    let user = await queryOne<any>(
      'SELECT * FROM users WHERE apple_user_id = $1',
      [appleUserId]
    )

    if (!user) {
      // Create new user
      const result = await query<any>(
        `INSERT INTO users (apple_user_id, display_name, email)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [appleUserId, displayName || null, email || null]
      )
      user = result[0]
      console.log(`✅ New user created: ${user.id}`)
    } else if (displayName || email) {
      // Update existing user if new info provided
      const result = await query<any>(
        `UPDATE users
         SET display_name = COALESCE($2, display_name),
             email = COALESCE($3, email)
         WHERE id = $1
         RETURNING *`,
        [user.id, displayName, email]
      )
      user = result[0]
    }

    // Generate JWT
    const token = app.jwt.sign(
      { userId: user.id, appleUserId: user.apple_user_id },
      { expiresIn: '30d' }
    )

    return {
      token,
      user: {
        id: user.id,
        displayName: user.display_name,
        email: user.email,
        createdAt: user.created_at,
      },
    }
  })
}

export default authRoutes
