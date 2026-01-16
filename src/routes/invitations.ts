import { FastifyPluginAsync } from 'fastify'
import { query, queryOne } from '../db.js'
import { nanoid } from 'nanoid'

const INVITE_BASE_URL = process.env.INVITE_BASE_URL || 'https://j4ro.com/pola/invite'
const INVITE_EXPIRY_DAYS = 7

const invitationsRoutes: FastifyPluginAsync = async (app) => {
  // All routes require authentication
  app.addHook('onRequest', (app as any).authenticate)

  // POST /babies/:babyId/invitations - Create invitation (registered under babies routes but imported here)
  // Actually this is handled in a different way - let me add it properly

  // POST /invitations/create/:babyId - Create invitation link
  app.post<{ Params: { babyId: string } }>('/create/:babyId', async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { babyId } = request.params

    // Check user is owner
    const baby = await queryOne(
      'SELECT owner_id, name FROM babies WHERE id = $1',
      [babyId]
    )

    if (!baby || baby.owner_id !== userId) {
      return reply.code(403).send({ error: 'Only owner can create invitations' })
    }

    // Generate unique code
    const code = nanoid(12)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS)

    const [invitation] = await query(
      `INSERT INTO invitations (baby_id, code, created_by, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [babyId, code, userId, expiresAt.toISOString()]
    )

    return {
      id: invitation.id,
      code: invitation.code,
      url: `${INVITE_BASE_URL}/${code}`,
      expiresAt: invitation.expires_at,
      babyName: baby.name,
    }
  })

  // GET /invitations/:code - Get invitation info (for preview before accepting)
  app.get<{ Params: { code: string } }>('/:code', async (request, reply) => {
    const { code } = request.params

    const invitation = await queryOne(
      `SELECT i.*, b.name as baby_name, u.display_name as owner_name
       FROM invitations i
       JOIN babies b ON i.baby_id = b.id
       JOIN users u ON b.owner_id = u.id
       WHERE i.code = $1 AND i.used_at IS NULL AND i.expires_at > NOW()`,
      [code]
    )

    if (!invitation) {
      return reply.code(404).send({ error: 'Invitation not found or expired' })
    }

    return {
      code: invitation.code,
      babyName: invitation.baby_name,
      ownerName: invitation.owner_name,
      expiresAt: invitation.expires_at,
    }
  })

  // POST /invitations/:code/accept - Accept invitation
  app.post<{ Params: { code: string } }>('/:code/accept', async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { code } = request.params

    // Get and validate invitation
    const invitation = await queryOne(
      `SELECT * FROM invitations
       WHERE code = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [code]
    )

    if (!invitation) {
      return reply.code(404).send({ error: 'Invitation not found or expired' })
    }

    // Check if already a caregiver
    const existingCarer = await queryOne(
      'SELECT 1 FROM caregivers WHERE baby_id = $1 AND user_id = $2',
      [invitation.baby_id, userId]
    )

    if (existingCarer) {
      return reply.code(400).send({ error: 'Already a caregiver for this baby' })
    }

    // Add as caregiver
    await query(
      `INSERT INTO caregivers (baby_id, user_id, role) VALUES ($1, $2, 'caregiver')`,
      [invitation.baby_id, userId]
    )

    // Mark invitation as used
    await query(
      `UPDATE invitations SET used_at = NOW(), used_by = $2 WHERE id = $1`,
      [invitation.id, userId]
    )

    // Get baby info
    const baby = await queryOne(
      'SELECT id, name FROM babies WHERE id = $1',
      [invitation.baby_id]
    )

    return {
      success: true,
      baby: {
        id: baby.id,
        name: baby.name,
      },
    }
  })
}

export default invitationsRoutes
