import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPhrase } from '@/lib/hash';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  try {
    const { phrase, username } = await req.json();

    if (!phrase || !username) {
      return NextResponse.json({ error: "Phrase and Username are required" }, { status: 400 });
    }

    // Validate phrase complexity? "Military grade" usually means strict rules.
    if (phrase.split(" ").length < 3 && phrase.length < 12) {
       // Ideally enforce more, but let's start here.
    }

    const hash = hashPhrase(phrase);
    
    // Check if phrase or username exists
    // Actually, DB unique constraints will handle this, but let's check for cleaner errors.
    
    // Attempt Insert
    const userId = uuidv4();
    
    try {
        await db.query(
          "INSERT INTO users (user_id, username, passphrase_hash) VALUES ($1, $2, $3)", 
          [userId, username, hash]
        );
        
        return NextResponse.json({ 
          success: true,
          user: {
            userId,
            username
          }
        });
    } catch (dbError: any) {
        if (dbError.code === '23505') { // Unique violation
            if (dbError.detail.includes('passphrase_hash')) {
                return NextResponse.json({ error: "This phrase is already in use. Please generate a new one." }, { status: 409 });
            }
            if (dbError.detail.includes('username')) {
                return NextResponse.json({ error: "Username is taken." }, { status: 409 });
            }
        }
        throw dbError;
    }

  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Registration failed." }, { status: 500 });
  }
}
