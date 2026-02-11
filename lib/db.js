const { Pool } = require("pg");

const connectionString = "postgresql://neondb_owner:npg_POcW0TdGDm1l@ep-bitter-thunder-aigaihs8-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";

const pool = new Pool({
  connectionString,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
