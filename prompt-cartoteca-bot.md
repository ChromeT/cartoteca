# Prompt: Bikin Discord Bot "Cartoteca Sync" (Node.js)

## Konteks Project
Saya punya web app bernama **Cartoteca** (repo: https://github.com/ChromeT/cartoteca), sebuah companion app untuk bot Discord "Karuta" (koleksi kartu). Cartoteca dibuat pakai React + TypeScript + Firebase (Firestore), dan saat ini data kartu diinput manual lewat form di web.

Saya ingin bikin **bot Discord terpisah** (Node.js + discord.js) yang otomatis membaca pesan dari bot Karuta di server Discord saya, lalu mengirim datanya langsung ke Firestore database Cartoteca yang sama — supaya saya tidak perlu input manual lagi.

## PENTING — Batasan yang wajib dipatuhi
- Bot ini **HANYA membaca (read-only)** pesan/embed yang dikirim oleh bot Karuta di channel Discord.
- Bot ini **TIDAK BOLEH** mengotomasi aksi gameplay apapun (tidak boleh auto-klik grab, auto-drop, auto-run command Karuta seperti `k!d`, `KWI`, `KLU`, `KI`, `KUI`, dll). Semua command itu tetap saya jalankan manual — bot hanya "mendengarkan" hasil balasannya.
- Jangan hardcode token/kredensial di source code — gunakan environment variables (`.env`).

## Tech Stack
- Node.js + discord.js (versi terbaru)
- firebase-admin SDK untuk akses Firestore
- dotenv untuk environment variables

## Struktur Data Firestore (Cartoteca)

```
users/{uid}/cards/{cardCode}       → satu dokumen per kartu
users/{uid}/wishlist/{id}
users/{uid}/tags/{id}
users/{uid}/inventory/current      → dokumen tunggal
users/{uid}/profile/current        → dokumen tunggal
```

### Schema `Card`:
```typescript
{
  code: string,              // kode unik kartu, misal "vlnvpjp"
  print: number | null,
  edition: number | null,
  name: string,
  series: string,
  condition: string,         // Damaged/Poor/Good/Excellent/Mint
  effort: number | null,
  wish: number | null,       // wishlist count
  price: number | null,
  isWorker: boolean,
  isTrade: boolean,
  frame: string,
  dye: string,
  tags: string,              // comma-separated
  notes: string,
  imageUrl: string,
  isInjured: boolean,
  createdAt: number,         // epoch ms
  stats: {
    toughness: string,
    quickness: string,
    purity: string,
    style: string,
    wellness: string,
    appeal: string,
    grabber: string,
    dropper: string,
    vanity: string
  },
  priceHistory: [{ date: number, price: number }]
}
```

### Schema `Inventory`:
```typescript
{
  tickets: number,
  gold: number,
  gems: number,
  dust0: number,
  dust1: number
  // dll sesuai tier dust yang ada
}
```

## Yang Perlu Dibuat Bot Ini

Bot harus mendengarkan `messageCreate` event, dan HANYA proses pesan dari bot Karuta (Discord bot ID: `646937666251915264`) yang berisi embed. Berdasarkan judul/isi embed, parse dan simpan/update data ke Firestore sebagai berikut:

### 1. Saat grab kartu / command `KV` (Card Details)
Ambil dari embed: `code`, `name`, `series`, `print`, `edition`, `condition`, `imageUrl`.
→ Simpan/update dokumen di `users/{uid}/cards/{code}` (pakai `set(..., {merge: true})`)

### 2. Saat command `KWI` (Worker Details / Effort)
Ambil: `effort` (angka total) dan breakdown `stats` (toughness, purity, wellness, style, grabber, dropper, quickness, toughness, vanity).
→ Perlu dicocokkan ke kartu yang sama berdasarkan nama karakter terakhir yang di-lookup (simpan state sementara di memory, karena `KWI` biasanya dijalankan tepat setelah grab/KV untuk kartu yang sama).
→ Update dokumen kartu yang sama dengan `merge: true`.

### 3. Saat command `KLU (nama karakter)` (Character Lookup)
Ambil: `wish` (wishlist count).
→ Cocokkan ke kartu berdasarkan nama karakter, update field `wish` di dokumen kartu terkait.

### 4. Saat command `KI` (Inventory)
Ambil: `gold`, `gems`, `tickets`, `dust0`, `dust1`, dst.
→ Overwrite (bukan merge) dokumen `users/{uid}/inventory/current`.

### 5. Saat command `KUI` (User Info)
Ambil data profil yang relevan (total kartu, dll).
→ Overwrite dokumen `users/{uid}/profile/current`.

## Langkah Development yang Diminta

1. Buat struktur project Node.js lengkap (`package.json`, `.env.example`, `.gitignore` yang exclude `.env` dan `serviceAccountKey.json`).
2. Buat helper functions untuk logging embed mentah dulu (title, description, semua fields) — supaya saya bisa screenshot/copy hasil log dan kirim balik untuk menyempurnakan parser regex, karena saya belum punya contoh format teks embed yang persis.
3. Buat fungsi parser terpisah per jenis embed (`parseCardDetails`, `parseWorkerDetails`, `parseCharacterLookup`, `parseInventory`, `parseUserInfo`) yang MUDAH DIEDIT nanti — karena format regex-nya kemungkinan perlu saya sesuaikan setelah lihat hasil log asli.
4. Buat sistem "pending cache" in-memory (Map) untuk mencocokkan data dari beberapa embed berurutan (KV → KWI → KLU) ke kartu yang sama sebelum disimpan final ke Firestore.
5. Sertakan instruksi setup di README: cara buat bot Discord, generate token, aktifkan Message Content Intent, generate Firebase service account key, dan cara menjalankan bot (`node index.js`).
6. Permission Discord bot yang dibutuhkan hanya: `View Channels` dan `Read Message History` (tidak perlu Send Messages atau permission administratif apapun).

## Output yang Diharapkan
Kode Node.js lengkap dan modular (bisa dipecah per file: `index.js`, `firebase.js`, `parsers.js`), plus file `README.md` setup instructions, plus `.env.example`.
