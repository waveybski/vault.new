const db = require("./lib/db");

async function migrateRoles() {
  try {
    console.log("Migrating to Role System...");
    
    // 1. Add role column
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
    `);
    
    // 2. Migrate existing admins
    await db.query(`
      UPDATE users 
      SET role = 'admin' 
      WHERE is_admin = true;
    `);
    
    // 3. Set Slmiegettem to OWNER
    await db.query(`
      UPDATE users 
      SET role = 'owner' 
      WHERE username ILIKE 'Slmiegettem';
    `);
    
    console.log("Roles migrated.");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

migrateRoles();