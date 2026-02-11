import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const connectionString = "postgresql://neondb_owner:npg_POcW0TdGDm1l@ep-bitter-thunder-aigaihs8-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";

const pool = new Pool({
  connectionString,
});

export async function GET() {
  try {
    const result = await pool.query('SELECT * FROM rooms ORDER BY created_at DESC LIMIT 50');
    return NextResponse.json({ rooms: result.rows });
  } catch (error) {
    console.error('Database Error:', error);
    return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 });
  }
}
