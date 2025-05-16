import modelAbsen from "../model/modelAbsen.js";
import moment from "moment-timezone";

const hasAttended = async (userId, type) => {
 // Hitung rentang hari ini dalam WIB
 const nowWIB     = moment().tz('Asia/Jakarta');
 const startOfDay = nowWIB.clone().startOf('day').toDate();
 const endOfDay   = nowWIB.clone().endOf('day').toDate();

  return await modelAbsen.exists({
    userId,
    type,
    timestamp: { $gte: startOfDay, $lte: endOfDay },
  });
};

export const absenMasuk = async (req, res, next) => {
  try {
    const userId = req.body.id;
  
    if (await hasAttended(userId, "IN"))
      return res
        .status(400)
        .json({ message: "Anda sudah absen masuk hari ini." });

    const nowWIB = moment().tz('Asia/Jakarta').toDate();
    const record = await modelAbsen.create({ userId, type: "IN", timestamp: nowWIB });
    res.json({ message: "Absen masuk tercatat.", record });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Absen gagal, silahkan coba kembali" });
    next();
  }
};

export const absenPulang = async (req, res, next) => {
  try {
    const userId = req.body.id;
    if (await hasAttended(userId, "OUT"))
      return res
        .status(400)
        .json({ message: "Anda sudah absen pulang hari ini." });

    const nowWIB = moment().tz('Asia/Jakarta').toDate();
    const record = await modelAbsen.create({ userId, type: "OUT", timestamp: nowWIB });
    res.json({ message: "Absen pulang tercatat.", record });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Absen gagal, silahkan coba kembali" });
    next();
  }
};


export const statusAbsen = async (req, res) => {
  try {
    const userId = req.body.id;
    const [hasIn, hasOut] = await Promise.all([
        hasAttended(userId, 'IN'),
        hasAttended(userId, 'OUT')
      ]);
      res.json({ hasIn, hasOut });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Gagal mengambil data absen" });
  }
}
