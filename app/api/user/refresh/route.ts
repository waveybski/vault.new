import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request) {
    try {
        const { userId } = await req.json();
        if (!userId) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

        const result = await db.query(
            "SELECT user_id, username, is_admin, role FROM users WHERE user_id = $1", 
            [userId]
        );

        if (result.rows.length === 0) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const user = result.rows[0];
        return NextResponse.json({
            user: {
                userId: user.user_id,
                username: user.username,
                isAdmin: user.is_admin || user.role === 'owner' || user.role === 'admin',
                role: user.role
            }
        });
    } catch (e) {
        return NextResponse.json({ error: "Server Error" }, { status: 500 });
    }
}