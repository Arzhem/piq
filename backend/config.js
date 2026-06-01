import "dotenv/config";

export const JWT_SECRET = process.env.JWT_SECRET;

export const DB_CONFIG = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
};
