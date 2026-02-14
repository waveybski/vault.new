import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPhrase } from '@/lib/hash';

export async function POST(req: Request) {
  try {
    const { phrase, newUsername } = await req.json();

    if (!phrase || !newUsername) {
      return NextResponse.json({ error: "Phrase and New Username are required" }, { status: 400 });
    }
    
    // Verify Phrase
    const hash = hashPhrase(phrase);
    const verify = await db.query("SELECT * FROM users WHERE passphrase_hash = $1", [hash]);
    
    if (verify.rows.length === 0) {
        return NextResponse.json({ error: "Authentication Failed. Incorrect Phrase." }, { status: 401 });
    }
    
    const user = verify.rows[0];
    
    // Check if new username is taken
    try {
        await db.query("UPDATE users SET username = $1 WHERE user_id = $2", [newUsername, user.user_id]);
        return NextResponse.json({ success: true, newUsername });
    } catch (err: any) {
        if (err.code === '23505') {
            return NextResponse.json({ error: "Username is already taken." }, { status: 409 });
        }
        throw err;
    }

  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
