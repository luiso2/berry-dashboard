import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

let pool = null;

export const initializePool = () => {
  if (pool) return pool;

  pool = new Pool({
    connectionString: config.database.connectionString,
    ssl: config.database.ssl,
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });

  return pool;
};

export const getPool = () => {
  if (!pool) {
    throw new Error('Pool not initialized. Call initializePool first.');
  }
  return pool;
};

export const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};
