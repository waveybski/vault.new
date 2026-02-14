import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');

  if (!query || query.length < 2) {
      return NextResponse.json({ users: [] });
  }

  try {
      // Find users matching username
      const result = await db.query(
          "SELECT username, user_id FROM users WHERE username ILIKE $1 LIMIT 5", 
          [`%${query}%`]
      );
      
      return NextResponse.json({ users: result.rows });
  } catch (err) {
      console.error(err);
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
