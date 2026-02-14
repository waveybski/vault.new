const db = require("./lib/db");

async function upgrade() {
  try {
    console.log("Upgrading users table with admin role...");
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
    `);
    
    // Create Bans Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS banned_users (
         id SERIAL PRIMARY KEY,
         user_id TEXT,
         ip_address TEXT,
         reason TEXT,
         banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Database upgraded.");
    process.exit(0);
  } catch (err) {
    console.error("Error upgrading table:", err);
    process.exit(1);
  }
}

upgrade();