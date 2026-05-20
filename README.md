# Roster Penjadwalan Aplikasi 📅

Aplikasi manajemen penjadwalan (Roster) komprehensif yang dikembangkan dengan antarmuka Vanilla JavaScript/Vite dan backend Express.js + PostgreSQL. Aplikasi ini memungkinkan Administrator untuk mengatur jadwal karyawan, membuat rotasi jadwal secara otomatis, melakukan override manual, dan mengekspor jadwal (PDF/Excel).

## 🚀 Fitur Utama
- **Autentikasi Multi-User**: Akses Role-based (Admin & Viewer).
- **Auto-Generate Jadwal**: Pembuatan jadwal bulanan otomatis menggunakan pola rotasi pintar (membedakan hari kerja vs akhir pekan/libur nasional).
- **Integrasi Hari Libur**: Penarikan data libur nasional Indonesia secara otomatis menggunakan API Publik (`libur.deno.dev`).
- **Ekspor Laporan**: Unduh jadwal lengkap dalam format `.xlsx` (Excel) dan `.pdf` dengan kualitas tinggi.
- **Manajemen Karyawan**: CRUD (Create, Read, Update, Delete) daftar karyawan dan posisi slot mereka (untuk penentuan jenis rotasi On Call / Back Up).

## 🛠️ Tech Stack
- **Frontend**: Vanilla JavaScript (ES Modules), CSS murni, Vite (Build Tool & Dev Server).
- **Backend**: Node.js, Express.js.
- **Database**: PostgreSQL (diintegrasikan menggunakan node-postgres `pg`).
- **Security**: JWT (`jsonwebtoken`) untuk otorisasi API, `bcryptjs` untuk hashing password.
- **Ekspor File**: `xlsx`, `jspdf`, dan `html2canvas`.

---

## 💻 Panduan Menjalankan Secara Lokal (Local Development)

### Prasyarat
- [Node.js](https://nodejs.org/en) (versi 18+ direkomendasikan)
- [PostgreSQL](https://www.postgresql.org/) (terpasang lokal, atau menggunakan layanan cloud seperti Supabase/Neon)

### Instalasi

1. **Clone repository** (jika belum):
   ```bash
   git clone https://github.com/MRafliRamadhani28/roster-inf.git
   cd roster-inf
   ```

2. **Install dependensi**:
   ```bash
   npm install
   ```

3. **Pengaturan Environment Variables**:
   Buat file `.env` di direktori root aplikasi, lalu masukkan Database URL (Connection String PostgreSQL Anda).
   ```env
   DATABASE_URL=postgresql://username:password@host:5432/dbname
   ```

4. **Inisialisasi Database (Seed)**:
   Perintah ini akan membuat semua tabel di PostgreSQL secara otomatis dan membuat user default (`admin`).
   ```bash
   npm run seed
   ```
   > **Catatan:** Jalankan perintah ini HANYA SEKALI saat awal setup.

### Menjalankan Server & Client

Aplikasi ini menggunakan 2 server lokal secara terpisah saat tahap *development*: Server Backend (Express) dan Server Frontend (Vite).

1. Buka **Terminal 1** (Untuk Backend):
   ```bash
   npm run dev
   ```
   *Backend API akan berjalan di `http://localhost:4003`*

2. Buka **Terminal 2** (Untuk Frontend):
   ```bash
   npm run preview
   # atau, jika ingin hot-reload development:
   npx vite
   ```
   *Frontend akan berjalan di port yang disediakan Vite (biasanya `http://localhost:3000` atau `5173`)*

## 🌐 Panduan Deployment (Production)

Proyek ini telah dikonfigurasi untuk siap rilis ke platform cloud seperti **Render.com**. Pada *production*, backend akan mem-build frontend dan men-serve file statis tersebut secara mandiri (Satu Web Service tunggal).

1. Daftarkan dan hubungkan project ini sebagai **Web Service** di Render.com.
2. Gunakan pengaturan berikut:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
3. Masukkan `DATABASE_URL` di pengaturan **Environment Variables** pada dashboard cloud Anda.
4. (Penting) Render akan otomatis menjalankan `npm run seed` pada saat awal server menyala berkat konfigurasi *start command* (`npm run seed && node server/index.js`) di `package.json`.

---

## 📄 Penggunaan Default (Login)
Setelah inisialisasi awal (Seed) dilakukan, Anda dapat login menggunakan kredensial bawaan:
- **Username**: `admin`
- **Password**: `admin123`

Jangan lupa untuk mengubah password atau menambahkan user admin lain di dashboard setelah masuk!
