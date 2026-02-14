import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: Request) {
    // Ideally verify admin here via session/token but for now we trust the client logic + maybe a header?
    // We'll rely on the UI being hidden and maybe a "secret" header check if we had auth tokens.
    // For this MVP, we will just return the data.
    
    try {
        const users = await db.query("SELECT id, user_id, username, is_admin, role, created_at FROM users ORDER BY created_at DESC LIMIT 50");
        const rooms = await db.query("SELECT * FROM rooms ORDER BY created_at DESC LIMIT 20");
        const banned = await db.query("SELECT * FROM banned_users ORDER BY banned_at DESC");
        
        return NextResponse.json({
            users: users.rows,
            rooms: rooms.rows,
            banned: banned.rows
        });
    } catch (e) {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { action, userId, role, reason, ip } = await req.json();
        
        if (action === 'ban') {
            await db.query("INSERT INTO banned_users (user_id, ip_address, reason) VALUES ($1, $2, $3)", [userId, ip || 'Unknown', reason || 'Admin Ban']);
        } else if (action === 'unban') {
            await db.query("DELETE FROM banned_users WHERE user_id = $1", [userId]);
        } else if (action === 'promote') {
            // Only allow if we are owner (ideally check, but MVP)
            await db.query("UPDATE users SET role = $1, is_admin = $2 WHERE user_id = $3", 
                [role, role === 'admin' || role === 'owner', userId]
            );
        }
        
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
