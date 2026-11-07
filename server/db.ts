import 'dotenv/config';
import pg from 'pg';
import { createHash } from 'node:crypto';
if(!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL trong .env');
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,max:10});
pool.on('error',()=>console.error('PostgreSQL: kết nối nền bị lỗi.'));
export const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function transaction<T>(fn:(c:pg.PoolClient)=>Promise<T>):Promise<T>{const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
