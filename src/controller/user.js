import modelUser from "../model/modelUser.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

export const createUser = async (req, res) => {
  const { username, password, nama, noTelp, role } = req.body;

  try {
    // Check if the user already exists
    const checkUser = await modelUser.findOne({ username });
    if (checkUser) {
      return res.status(409).json({ message: "Username already exists" });
    }

    // 2. Pastikan kedua file hadir
    if (
      !req.files ||
      !Array.isArray(req.files.fotoWajah) ||
      !Array.isArray(req.files.fotoKTP) ||
      !req.files.fotoWajah[0] ||
      !req.files.fotoKTP[0]
    ) {
      return res
        .status(400)
        .json({ message: "Gambar Dibutuhkan: Foto Wajah & Foto KTP" });
    }

    // 3. Ambil objek file pertama dari masing-masing field
    const wajahFile = req.files.fotoWajah[0];
    const ktpFile = req.files.fotoKTP[0];

    //4. Bangun metadata URL & nama file untuk disimpan di DB
    const baseUrl = `${req.protocol}://${req.get("host")}/uploads`;
    const fotoWajahMeta = {
      url: `${baseUrl}/${wajahFile.filename}`,
      filename: wajahFile.filename,
      mimeType: wajahFile.mimetype,
      size: wajahFile.size,
    };
    const fotoKTPMeta = {
      url: `${baseUrl}/${ktpFile.filename}`,
      filename: ktpFile.filename,
      mimeType: ktpFile.mimetype,
      size: ktpFile.size,
    };

    const user = await modelUser.create({
      username,
      password,
      nama,
      noTelp,
      fotoWajah: fotoWajahMeta,
      fotoKTP: fotoKTPMeta,
      role,
    });

    res.status(201).json(user);
  } catch (error) {
    res.status(409).json({ message: error.message });
    if (req.files) {
      for (const field of ["fotoWajah", "fotoKTP"]) {
        if (Array.isArray(req.files[field])) {
          req.files[field].forEach((f) => {
            const p = path.join(process.cwd(), "uploads", f.filename);
            if (fs.existsSync(p)) fs.unlinkSync(p);
          });
        }
      }
    }
    next(error);
  }
};

export const getUser = async (req, res) => {
  try {
    const users = await modelUser
      .find()
      .select("username nama noTelp role ")
      .sort({ createdAt: -1 });

    if (!users.length) {
      return res.status(404).json({ message: "Tidak ada user ditemukan" });
    }

    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Gagal mengambil data user" });
  }
};

export const getUserById = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await modelUser
      .findById(id)
      .select(
        "username nama noTelp fotoWajah fotoKTP role "
      );

    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error(`Error fetching user by ID (${id}):`, error);
    res.status(500).json({ message: "Gagal mengambil data user" });
  }
};

export const updateUser = async (req, res) => {
  const { id } = req.params;
  const { username, password, nama, noTelp, email } = req.body;
  try {
    const user = await modelUser.findByIdAndUpdate(
      id,
      {
        username,
        password,
        nama,
        noTelp,
        email,
      },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(409).json({ message: error.message });
  }
};

export const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await modelUser.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(409).json({ message: error.message });
  }
};
