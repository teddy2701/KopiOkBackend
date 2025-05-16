import multer from 'multer';
import path from 'path';

// 1. Konfigurasi storage: folder dan penamaan file unik
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // simpan di folder uploads/
    cb(null, path.join(process.cwd(), 'uploads'));      // :contentReference[oaicite:5]{index=5}
  },
  filename: (req, file, cb) => {
    // nama: fieldname-timestamp.ext
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${Date.now()}${ext}`);  // :contentReference[oaicite:6]{index=6}
  }
});

// 2. Filter: hanya izinkan tipe gambar
const imageFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
  if (!allowedTypes.includes(file.mimetype)) {
    const err = new Error('Only image files are allowed');
    err.code = 'INVALID_FILE_TYPE';
    return cb(err, false);                              // :contentReference[oaicite:7]{index=7}
  }
  cb(null, true);
};

// 3. Inisialisasi multer dengan batas ukuran dan filter
const uploadImage = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },   // 2MB batas :contentReference[oaicite:0]{index=0}
    fileFilter: imageFileFilter
  }).fields([
    { name: 'fotoWajah', maxCount: 1 },
    { name: 'fotoKTP',   maxCount: 1 }
  ]);

export default uploadImage;
