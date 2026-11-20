const fs = require("node:fs");
const mysql = require("mysql2/promise");

const requiredVariables = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];

for (const name of requiredVariables) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const sslEnabled = process.env.DB_SSL === "true";
let ssl;

if (sslEnabled) {
  ssl = { rejectUnauthorized: true };
  if (process.env.DB_SSL_CA) {
    ssl.ca = fs.readFileSync(process.env.DB_SSL_CA, "utf8");
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  enableKeepAlive: true,
  ssl
});

module.exports = pool;
