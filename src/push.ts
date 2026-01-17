import apn from '@parse/node-apn'
import { query } from './db.js'

let apnProvider: apn.Provider | null = null

export function initPush() {
  if (!process.env.APNS_KEY_PATH) {
    console.log('⚠️ APNS not configured - push notifications disabled')
    return
  }

  apnProvider = new apn.Provider({
    token: {
      key: process.env.APNS_KEY_PATH,
      keyId: process.env.APNS_KEY_ID!,
      teamId: process.env.APNS_TEAM_ID!,
    },
    production: process.env.NODE_ENV === 'production',
  })

  console.log('✅ APNS initialized')
}

export async function sendPushToCarers(
  babyId: string,
  excludeUserId: string,
  title: string,
  body: string,
  data?: Record<string, any>
) {
  if (!apnProvider) return

  // Get device tokens for all caregivers except the one who made the change
  const tokens = await query<{ device_token: string }>(
    `SELECT u.device_token
     FROM caregivers c
     JOIN users u ON c.user_id = u.id
     WHERE c.baby_id = $1
       AND c.user_id != $2
       AND u.device_token IS NOT NULL`,
    [babyId, excludeUserId]
  )

  if (tokens.length === 0) return

  const notification = new apn.Notification()
  notification.alert = { title, body }
  notification.sound = 'default'
  notification.topic = 'com.cielebak.Pola'
  notification.contentAvailable = true  // Enable background fetch / silent push
  notification.payload = { babyId, ...data }

  const deviceTokens = tokens.map(t => t.device_token)

  try {
    const result = await apnProvider.send(notification, deviceTokens)
    if (result.failed.length > 0) {
      console.log('Push failed for some devices:', result.failed)
    }
  } catch (err) {
    console.error('Push error:', err)
  }
}
