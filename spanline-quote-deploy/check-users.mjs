import mysql from 'mysql2/promise';
const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);
const [rows] = await conn.query("SELECT id, openId, name, email, role, lastSignedIn FROM users WHERE email LIKE '%commisso%' OR name LIKE '%Tony%' OR name LIKE '%tony%' ORDER BY id");
console.log(JSON.stringify(rows, null, 2));
await conn.end();
