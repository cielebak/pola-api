import { FastifyPluginAsync } from 'fastify'
import { query, queryOne } from '../db.js'

interface CreateBabyBody {
  name: string
  birthDate: string
  weightAtBirth?: number
  heightAtBirth?: number
  currentWeight?: number
  currentHeight?: number
  feedingGoal?: number
  avatarUrl?: string
}

interface UpdateBabyBody {
  name?: string
  birth_date?: string
  currentWeight?: number
  currentHeight?: number
  feedingGoal?: number
  avatarUrl?: string
}

const babiesRoutes: FastifyPluginAsync = async (app) => {
  // All routes require authentication
  app.addHook('onRequest', (app as any).authenticate)

  // GET /babies - List babies where user is caregiver
  app.get('/', async (request) => {
    const { userId } = request.user as { userId: string }

    const babies = await query(
      `SELECT b.*, c.role, u.display_name as owner_name
       FROM babies b
       JOIN caregivers c ON b.id = c.baby_id
       JOIN users u ON b.owner_id = u.id
       WHERE c.user_id = $1
       ORDER BY b.created_at DESC`,
      [userId]
    )

    return babies.map(b => ({
      id: b.id,
      name: b.name,
      birthDate: b.birth_date,
      weightAtBirth: b.weight_at_birth ? parseFloat(b.weight_at_birth) : null,
      heightAtBirth: b.height_at_birth ? parseFloat(b.height_at_birth) : null,
      currentWeight: b.current_weight ? parseFloat(b.current_weight) : null,
      currentHeight: b.current_height ? parseFloat(b.current_height) : null,
      feedingGoal: b.feeding_goal,
      avatarUrl: b.avatar_url,
      isOwner: b.role === 'owner',
      ownerId: b.owner_id,
      ownerName: b.owner_name,
      createdAt: b.created_at,
    }))
  })

  // POST /babies - Create baby (user becomes owner)
  app.post<{ Body: CreateBabyBody }>('/', async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { name, birthDate, weightAtBirth, heightAtBirth, currentWeight, currentHeight, feedingGoal, avatarUrl } = request.body

    if (!name || !birthDate) {
      return reply.code(400).send({ error: 'name and birthDate are required' })
    }

    // Get user's display name
    const user = await queryOne('SELECT display_name FROM users WHERE id = $1', [userId])

    // Create baby
    const [baby] = await query(
      `INSERT INTO babies (owner_id, name, birth_date, weight_at_birth, height_at_birth, current_weight, current_height, feeding_goal, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, name, birthDate, weightAtBirth, heightAtBirth, currentWeight, currentHeight, feedingGoal, avatarUrl]
    )

    // Add user as owner in caregivers
    await query(
      `INSERT INTO caregivers (baby_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [baby.id, userId]
    )

    return {
      id: baby.id,
      name: baby.name,
      birthDate: baby.birth_date,
      weightAtBirth: baby.weight_at_birth ? parseFloat(baby.weight_at_birth) : null,
      heightAtBirth: baby.height_at_birth ? parseFloat(baby.height_at_birth) : null,
      currentWeight: baby.current_weight ? parseFloat(baby.current_weight) : null,
      currentHeight: baby.current_height ? parseFloat(baby.current_height) : null,
      feedingGoal: baby.feeding_goal,
      avatarUrl: baby.avatar_url,
      isOwner: true,
      ownerId: baby.owner_id,
      ownerName: user?.display_name || null,
      createdAt: baby.created_at,
    }
  })

  // PUT /babies/:id - Update baby
  app.put<{ Params: { id: string }, Body: UpdateBabyBody }>('/:id', async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params
    const { name, birth_date, currentWeight, currentHeight, feedingGoal, avatarUrl } = request.body

    // Check user is caregiver
    const caregiver = await queryOne(
      'SELECT role FROM caregivers WHERE baby_id = $1 AND user_id = $2',
      [id, userId]
    )

    if (!caregiver) {
      return reply.code(403).send({ error: 'Access denied' })
    }

    const [baby] = await query(
      `UPDATE babies
       SET name = COALESCE($2, name),
           birth_date = COALESCE($3, birth_date),
           current_weight = COALESCE($4, current_weight),
           current_height = COALESCE($5, current_height),
           feeding_goal = COALESCE($6, feeding_goal),
           avatar_url = COALESCE($7, avatar_url),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, name, birth_date, currentWeight, currentHeight, feedingGoal, avatarUrl]
    )

    // Get owner name
    const owner = await queryOne('SELECT display_name FROM users WHERE id = $1', [baby.owner_id])

    return {
      id: baby.id,
      name: baby.name,
      birthDate: baby.birth_date,
      weightAtBirth: baby.weight_at_birth ? parseFloat(baby.weight_at_birth) : null,
      heightAtBirth: baby.height_at_birth ? parseFloat(baby.height_at_birth) : null,
      currentWeight: baby.current_weight ? parseFloat(baby.current_weight) : null,
      currentHeight: baby.current_height ? parseFloat(baby.current_height) : null,
      feedingGoal: baby.feeding_goal,
      avatarUrl: baby.avatar_url,
      isOwner: caregiver.role === 'owner',
      ownerId: baby.owner_id,
      ownerName: owner?.display_name || null,
      createdAt: baby.created_at,
    }
  })

  // DELETE /babies/:id - Delete baby (owner only)
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params

    // Check user is owner
    const baby = await queryOne(
      'SELECT owner_id FROM babies WHERE id = $1',
      [id]
    )

    if (!baby) {
      return reply.code(404).send({ error: 'Baby not found' })
    }

    if (baby.owner_id !== userId) {
      return reply.code(403).send({ error: 'Only owner can delete' })
    }

    await query('DELETE FROM babies WHERE id = $1', [id])

    return { success: true }
  })

  // GET /babies/:id/caregivers - List caregivers
  app.get<{ Params: { id: string } }>('/:id/caregivers', async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params

    // Check user is caregiver
    const isCarer = await queryOne(
      'SELECT 1 FROM caregivers WHERE baby_id = $1 AND user_id = $2',
      [id, userId]
    )

    if (!isCarer) {
      return reply.code(403).send({ error: 'Access denied' })
    }

    const caregivers = await query(
      `SELECT u.id, u.display_name, u.email, c.role, c.joined_at
       FROM caregivers c
       JOIN users u ON c.user_id = u.id
       WHERE c.baby_id = $1
       ORDER BY c.role DESC, c.joined_at ASC`,
      [id]
    )

    return caregivers.map(c => ({
      userId: c.id,
      displayName: c.display_name,
      email: c.email,
      role: c.role,
      joinedAt: c.joined_at,
    }))
  })

  // DELETE /babies/:id/caregivers/:userId - Remove caregiver (owner only)
  app.delete<{ Params: { id: string, odUserId: string } }>('/:id/caregivers/:odUserId', async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id, odUserId } = request.params

    // Check requester is owner
    const baby = await queryOne(
      'SELECT owner_id FROM babies WHERE id = $1',
      [id]
    )

    if (!baby || baby.owner_id !== userId) {
      return reply.code(403).send({ error: 'Only owner can remove caregivers' })
    }

    // Can't remove owner
    if (odUserId === userId) {
      return reply.code(400).send({ error: "Can't remove yourself as owner" })
    }

    await query(
      'DELETE FROM caregivers WHERE baby_id = $1 AND user_id = $2',
      [id, odUserId]
    )

    return { success: true }
  })
}

export default babiesRoutes
