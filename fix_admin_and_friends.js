const db = require("./lib/db");

async function fixAdmin() {
  try {
    console.log("Manually promoting Slmiegettem to admin...");
    // Case insensitive update
    const res = await db.query(`
      UPDATE users 
      SET is_admin = true 
      WHERE username ILIKE 'Slmiegettem';
    `);
    
    console.log(`Updated ${res.rowCount} users.`);
    
    // Also verifying tables for friends
    console.log("Creating friends tables...");
    await db.query(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        id SERIAL PRIMARY KEY,
        sender_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending', -- pending, accepted, rejected
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(sender_id, receiver_id)
      );
    `);
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS friends (
        id SERIAL PRIMARY KEY,
        user_id_1 TEXT NOT NULL,
        user_id_2 TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id_1, user_id_2)
      );
    `);

    console.log("Done.");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

fixAdmin();