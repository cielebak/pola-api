import { FastifyPluginAsync } from 'fastify'
import { query, queryOne } from '../db.js'
import { sendPushToCarers } from '../push.js'

interface CreateActivityBody {
  type: 'feeding' | 'diaper'
  data: Record<string, any>
  date: string
}

interface UpdateActivityBody {
  data?: Record<string, any>
  date?: string
}

const activitiesRoutes: FastifyPluginAsync = async (app) => {
  // All routes require authentication
  app.addHook('onRequest', (app as any).authenticate)

  // GET /babies/:babyId/activities - List activities
  app.get<{ Params: { babyId: string }, Querystring: { from?: string, to?: string, limit?: string } }>(
    '/babies/:babyId/activities',
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { babyId } = request.params
      const { from, to, limit = '100' } = request.query

      // Check user is caregiver
      const isCarer = await queryOne(
        'SELECT 1 FROM caregivers WHERE baby_id = $1 AND user_id = $2',
        [babyId, userId]
      )

      if (!isCarer) {
        return reply.code(403).send({ error: 'Access denied' })
      }

      let sql = `
        SELECT a.*, u.display_name as created_by_name
        FROM activities a
        LEFT JOIN users u ON a.created_by = u.id
        WHERE a.baby_id = $1
      `
      const params: any[] = [babyId]

      if (from) {
        params.push(from)
        sql += ` AND a.activity_date >= $${params.length}`
      }

      if (to) {
        params.push(to)
        sql += ` AND a.activity_date <= $${params.length}`
      }

      sql += ` ORDER BY a.activity_date DESC LIMIT $${params.length + 1}`
      params.push(parseInt(limit))

      const activities = await query(sql, params)

      return activities.map(a => ({
        id: a.id,
        babyId: a.baby_id,
        type: a.activity_type,
        data: a.activity_data,
        date: a.activity_date,
        createdBy: a.created_by,
        createdByName: a.created_by_name,
        createdAt: a.created_at,
      }))
    }
  )

  // POST /babies/:babyId/activities - Create activity
  app.post<{ Params: { babyId: string }, Body: CreateActivityBody }>(
    '/babies/:babyId/activities',
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { babyId } = request.params
      const { type, data, date } = request.body

      if (!type || !data || !date) {
        return reply.code(400).send({ error: 'type, data, and date are required' })
      }

      // Check user is caregiver
      const isCarer = await queryOne(
        'SELECT 1 FROM caregivers WHERE baby_id = $1 AND user_id = $2',
        [babyId, userId]
      )

      if (!isCarer) {
        return reply.code(403).send({ error: 'Access denied' })
      }

      const [activity] = await query(
        `INSERT INTO activities (baby_id, created_by, activity_type, activity_data, activity_date)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [babyId, userId, type, JSON.stringify(data), date]
      )

      // Get baby name and user name for push
      const [info] = await query(
        `SELECT b.name as baby_name, u.display_name as user_name
         FROM babies b, users u
         WHERE b.id = $1 AND u.id = $2`,
        [babyId, userId]
      )

      // Send push to other caregivers
      const pushTitle = type === 'feeding' ? '🍼 Nowe karmienie' : '👶 Nowa pieluszka'
      const pushBody = `${info?.user_name || 'Opiekun'} dodał(a) wpis dla ${info?.baby_name || 'dziecka'}`

      sendPushToCarers(babyId, userId, pushTitle, pushBody, { activityId: activity.id })

      return {
        id: activity.id,
        babyId: activity.baby_id,
        type: activity.activity_type,
        data: activity.activity_data,
        date: activity.activity_date,
        createdBy: activity.created_by,
        createdAt: activity.created_at,
      }
    }
  )

  // PUT /activities/:id - Update activity
  app.put<{ Params: { id: string }, Body: UpdateActivityBody }>(
    '/activities/:id',
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params
      const { data, date } = request.body

      // Get activity and check access
      const activity = await queryOne(
        `SELECT a.*, c.user_id as carer_check
         FROM activities a
         JOIN caregivers c ON a.baby_id = c.baby_id AND c.user_id = $2
         WHERE a.id = $1`,
        [id, userId]
      )

      if (!activity) {
        return reply.code(404).send({ error: 'Activity not found or access denied' })
      }

      const [updated] = await query(
        `UPDATE activities
         SET activity_data = COALESCE($2, activity_data),
             activity_date = COALESCE($3, activity_date)
         WHERE id = $1
         RETURNING *`,
        [id, data ? JSON.stringify(data) : null, date]
      )

      return {
        id: updated.id,
        babyId: updated.baby_id,
        type: updated.activity_type,
        data: updated.activity_data,
        date: updated.activity_date,
        createdBy: updated.created_by,
        createdAt: updated.created_at,
      }
    }
  )

  // DELETE /activities/:id - Delete activity
  app.delete<{ Params: { id: string } }>(
    '/activities/:id',
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params

      // Check user is caregiver of the baby
      const activity = await queryOne(
        `SELECT a.baby_id
         FROM activities a
         JOIN caregivers c ON a.baby_id = c.baby_id AND c.user_id = $2
         WHERE a.id = $1`,
        [id, userId]
      )

      if (!activity) {
        return reply.code(404).send({ error: 'Activity not found or access denied' })
      }

      await query('DELETE FROM activities WHERE id = $1', [id])

      return { success: true }
    }
  )
}

export default activitiesRoutes
