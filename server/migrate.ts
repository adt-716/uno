import { readFile } from 'node:fs/promises';
import { pool } from './db';
try {
 await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
 console.log('Đã tạo schema UNO.');
} catch (error) {
 const code = (error as { code?: string }).code;
 const reasons: Record<string,string> = {
  '28P01': 'Xác thực thất bại. Kiểm tra USERNAME và PASSWORD trong DATABASE_URL. Username phải là user/role PostgreSQL, không phải tên database.',
  '28000': 'User PostgreSQL không được phép đăng nhập. Kiểm tra role và cấu hình xác thực.',
  '3D000': 'Database không tồn tại. Kiểm tra tên database ở cuối DATABASE_URL.',
  '42501': 'User thiếu quyền tạo bảng. Cần quyền CREATE trên schema public trong database này.',
  'ECONNREFUSED': 'Không kết nối được PostgreSQL. Kiểm tra dịch vụ, host và port.',
  'ENOTFOUND': 'Không tìm thấy host PostgreSQL. Kiểm tra hostname trong DATABASE_URL.',
 };
 console.error(`Không thể migrate${code ? ` (${code})` : ''}. ${code && reasons[code] ? reasons[code] : 'Kiểm tra DATABASE_URL, kết nối PostgreSQL và quyền tạo bảng.'}`);
 process.exitCode=1;
} finally { await pool.end(); }
