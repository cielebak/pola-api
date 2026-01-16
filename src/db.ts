import pg from 'pg'

const { Pool } = pg

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export async function initDb() {
  // Run schema if tables don't exist
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        apple_user_id   VARCHAR(255) UNIQUE NOT NULL,
        display_name    VARCHAR(255),
        email           VARCHAR(255),
        device_token    VARCHAR(255),
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS babies (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id            UUID REFERENCES users(id) ON DELETE CASCADE,
        name                VARCHAR(255) NOT NULL,
        birth_date          DATE NOT NULL,
        weight_at_birth     DECIMAL(4,2),
        height_at_birth     DECIMAL(4,1),
        current_weight      DECIMAL(4,2),
        current_height      DECIMAL(4,1),
        feeding_goal        INTEGER,
        avatar_url          TEXT,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS caregivers (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        baby_id     UUID REFERENCES babies(id) ON DELETE CASCADE,
        user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
        role        VARCHAR(20) DEFAULT 'caregiver',
        joined_at   TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(baby_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS invitations (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        baby_id     UUID REFERENCES babies(id) ON DELETE CASCADE,
        code        VARCHAR(16) UNIQUE NOT NULL,
        created_by  UUID REFERENCES users(id),
        expires_at  TIMESTAMPTZ NOT NULL,
        used_at     TIMESTAMPTZ,
        used_by     UUID REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS activities (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        baby_id         UUID REFERENCES babies(id) ON DELETE CASCADE,
        created_by      UUID REFERENCES users(id),
        activity_type   VARCHAR(20) NOT NULL,
        activity_data   JSONB NOT NULL,
        activity_date   TIMESTAMPTZ NOT NULL,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_activities_baby_date ON activities(baby_id, activity_date DESC);
    CREATE INDEX IF NOT EXISTS idx_caregivers_user ON caregivers(user_id);
    CREATE INDEX IF NOT EXISTS idx_invitations_code ON invitations(code) WHERE used_at IS NULL;
  `

  await db.query(schema)
  console.log('✅ Database schema initialized')
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await db.query(text, params)
  return result.rows
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] || null
}
