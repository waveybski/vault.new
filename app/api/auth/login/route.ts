import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPhrase } from '@/lib/hash';

export async function POST(req: Request) {
  try {
    const { phrase } = await req.json();

    if (!phrase) {
      return NextResponse.json({ error: "Phrase is required" }, { status: 400 });
    }

    const hash = hashPhrase(phrase);
    
    // Check if user exists
    const result = await db.query("SELECT * FROM users WHERE passphrase_hash = $1", [hash]);
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      return NextResponse.json({ 
        found: true,
        user: {
          userId: user.user_id,
          username: user.username,
          isAdmin: user.is_admin
        }
      });
    } else {
      return NextResponse.json({ found: false });
    }

  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
