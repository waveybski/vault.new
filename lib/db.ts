import { Pool } from 'pg';

const connectionString = "postgresql://neondb_owner:npg_POcW0TdGDm1l@ep-bitter-thunder-aigaihs8-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";

const pool = new Pool({
  connectionString,
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
};
