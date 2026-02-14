import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { senderId, receiverId } = await req.json();
    if (!senderId || !receiverId) return NextResponse.json({ error: "Missing IDs" }, { status: 400 });

    // Check if already friends
    // We check both directions
    const friends = await db.query(
        "SELECT * FROM friends WHERE (user_id_1 = $1 AND user_id_2 = $2) OR (user_id_1 = $2 AND user_id_2 = $1)",
        [senderId, receiverId]
    );
    if (friends.rows.length > 0) return NextResponse.json({ error: "Already friends" }, { status: 400 });

    // Check existing request
    const existing = await db.query(
        "SELECT * FROM friend_requests WHERE sender_id = $1 AND receiver_id = $2 AND status = 'pending'",
        [senderId, receiverId]
    );
    if (existing.rows.length > 0) return NextResponse.json({ error: "Request already sent" }, { status: 400 });

    await db.query(
        "INSERT INTO friend_requests (sender_id, receiver_id) VALUES ($1, $2)",
        [senderId, receiverId]
    );
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: "Missing UserID" }, { status: 400 });
    
    try {
        // Get Incoming Requests
        const incoming = await db.query(`
            SELECT r.id, r.sender_id, u.username 
            FROM friend_requests r
            JOIN users u ON r.sender_id = u.user_id
            WHERE r.receiver_id = $1 AND r.status = 'pending'
        `, [userId]);
        
        // Get Friends
        const friends = await db.query(`
            SELECT 
                CASE WHEN f.user_id_1 = $1 THEN f.user_id_2 ELSE f.user_id_1 END as friend_id,
                u.username
            FROM friends f
            JOIN users u ON u.user_id = (CASE WHEN f.user_id_1 = $1 THEN f.user_id_2 ELSE f.user_id_1 END)
            WHERE f.user_id_1 = $1 OR f.user_id_2 = $1
        `, [userId]);
        
        return NextResponse.json({ 
            requests: incoming.rows,
            friends: friends.rows
        });
    } catch (e) {
        return NextResponse.json({ error: "Error" }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const { requestId, action } = await req.json(); // action: accept, reject
        
        if (action === 'accept') {
            const reqData = await db.query("SELECT * FROM friend_requests WHERE id = $1", [requestId]);
            if (reqData.rows.length === 0) return NextResponse.json({ error: "Request not found" }, { status: 404 });
            
            const { sender_id, receiver_id } = reqData.rows[0];
            
            // Add Friend
            await db.query("INSERT INTO friends (user_id_1, user_id_2) VALUES ($1, $2)", [sender_id, receiver_id]);
            
            // Update Request
            await db.query("UPDATE friend_requests SET status = 'accepted' WHERE id = $1", [requestId]);
            
            return NextResponse.json({ success: true });
        } else {
             await db.query("UPDATE friend_requests SET status = 'rejected' WHERE id = $1", [requestId]);
             return NextResponse.json({ success: true });
        }
    } catch (e) {
        return NextResponse.json({ error: "Error" }, { status: 500 });
    }
}
