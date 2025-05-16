import mongoose from "mongoose";
import modelProduk from "../model/modelProduk.js";
import modelSales from "../model/modelSales.js";
import modelProdukHistory from "../model/modelProdukHistory.js";
import modelUser from "../model/modelUser.js";
import modelAbsen from "../model/modelAbsen.js";
import moment from "moment-timezone";


export const getSales = async (req, res, next) => {
  try {
    const sales = await modelSales
      .find()
      .populate("product", "name sellingPrice")
      .sort({ createdAt: -1 });
    res.json(sales);
  } catch (err) {
    console.log(err)
    next(err);
  }
};

export const processReturns = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { returns, userId, note } = req.body;
    if (!Array.isArray(returns) || returns.length === 0) {
      return res.status(400).json({ message: "Format data salah" });
    }

    const results = [];
    for (const { productId, returnedQuantity } of returns) {
      // validasi non-negative
      if (returnedQuantity == null || returnedQuantity < 0) {
        throw new Error("Jumlah pengembalian tidak valid");
      }
      const product = await modelProduk.findById(productId).session(session);
  
      if (!product) {
        throw new Error(`Product ${productId} Tidak ditemukan`);
      }

      // VALIDASI: dibandingkan dengan pickup terakhir
      const lastOut = await modelProdukHistory
        .findOne({
          product: productId,
          user: userId,
          changeType: "OUT",
        })
        .sort({ date: -1 })
        .session(session);

        console.log(lastOut)

      if (!lastOut) {
        throw new Error(
          `Tidak ditemukan pickup sebelumnya untuk ${product.name}`
        );
      }

          // Gunakan moment-timezone untuk WIB
    const nowWIB = moment().tz('Asia/Jakarta');
    // const pickupDate = moment(lastOut.date).tz('Asia/Jakarta').startOf('day');
    // const todayWIB = nowWIB.clone().startOf('day');
      // if (!pickupDate.isSame(todayWIB)) {
      //   throw new Error(
      //     `Pengembalian hanya dapat dilakukan pada tanggal pickup: ${pickupDate}`
      //   );
      // }

      // Cek existing return dengan rentang waktu WIB
      const startOfDay = nowWIB.clone().startOf('day').toDate();
      const endOfDay = nowWIB.clone().endOf('day').toDate();

      const existingReturn = await modelProdukHistory
        .findOne({
          product: productId,
          user: userId,
          changeType: "IN",
          date: { $gte: startOfDay, $lt: endOfDay },
        })
        .session(session);

        if (existingReturn) {
          throw new Error(`Anda sudah melakukan pengembalian untuk ${product.name} hari ini`);
        }
        

      if (returnedQuantity > lastOut.amount) {
        throw new Error(
          `Jumlah retur (${returnedQuantity}) melebihi pickup (${lastOut.amount}) untuk ${product.name}`
        );
      }
      
      const initialStock = product.stock;
      const soldQuantity = lastOut.amount - returnedQuantity;
      // OUT = penjualan
      if (soldQuantity > 0) {
        await modelSales.create(
          [
            {
              product: productId,
              quantity: soldQuantity,
              totalPrice: soldQuantity * product.sellingPrice,
              user: userId,
            },
          ],
          { session }
        );
      }

      // IN = pengembalian
      if (returnedQuantity > 0) {
        await modelProdukHistory.create(
          [
            {
              product: productId,
              changeType: "IN",
              amount: returnedQuantity,
              user: userId,
              note: "Produk dikembalikan",
            },
          ],
          { session }
        );
      }

      // perbarui stok
      product.stock += returnedQuantity;
      await product.save({ session });

      results.push({
        productId,
        productName: product.name,
        initialStock,
        returnedQuantity,
        soldQuantity,
      });
    }

    await session.commitTransaction();
    res.json({ processed: results });
  } catch (err) {
    console.log(err);
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

/**
 * @desc   Process stock pickups (outgoing) and record history
 * @route  POST /api/inventory/pickup
 * @access Protected
 *
 * Body: {
 *   pickups: [
 *     { productId: String, quantity: Number },
 *     …
 *   ],
 *   note: String
 * }
 */
export const processPickup = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { pickups, note, userId } = req.body;
    if (!Array.isArray(pickups) || pickups.length === 0) {
      return res.status(400).json({ message: "pickups array is required." });
    }

    const results = [];

    for (const { productId, quantity } of pickups) {
      if (quantity == null || quantity < 0) {
        throw new Error("quantity must be non-negative");
      }
      const product = await modelProduk.findById(productId).session(session);
      if (!product) throw new Error(`Product ${productId} not found`);
      if (product.stock < quantity) {
        throw new Error(`Stok ${product.name} tidak cukup`);
      }

      // Reduce stock
      product.stock -= quantity;
      await product.save({ session });

      // Record history
      await modelProdukHistory.create(
        [
          {
            product: productId,
            changeType: "OUT",
            amount: quantity,
            user: userId,
            note: note || "Pengambilan stok",
          },
        ],
        { session }
      );

      results.push({
        productId,
        productName: product.name,
        pickedQuantity: quantity,
        remainingStock: product.stock,
      });
    }

    await session.commitTransaction();
    res.json({ picked: results });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

export const getSalesHistoryById = async (req, res) => {
  const { id } = req.params;

  try {
    const histories = await modelProdukHistory.find({
      user: id,
      changeType: { $in: ['OUT', 'IN'] }
    })
    .populate('product')
    .lean();

    const grouped = {};
 

    histories.forEach((item) => {
      // Konversi tanggal ke WIB
      const dateWIB = moment(item.date)
        .tz('Asia/Jakarta')
        .format('YYYY-MM-DD');
      
      const productName = item.product.name;
      const harga = item.product.sellingPrice || 0;


      if (!grouped[dateWIB]) grouped[dateWIB] = {};
      if (!grouped[dateWIB][productName]) {
        grouped[dateWIB][productName] = {
          ambil: 0,
          kembali: 0,
          harga: harga
        };
      }

      // Akumulasi jumlah
      if (item.changeType === 'OUT') {
        grouped[dateWIB][productName].ambil += item.amount;
      } else if (item.changeType === 'IN') {
        grouped[dateWIB][productName].kembali += item.amount;
      }
    });

    
    // Format output
    const historyData = Object.entries(grouped).map(([date, products]) => ({
      date,
      products: Object.entries(products).map(([name, data]) => ({
        name,
        ambil: data.ambil,
        kembali: data.kembali,
        revenue: (data.ambil - data.kembali) * data.harga
      }))
    }))

    // Urutkan berdasarkan tanggal
    historyData.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(historyData);
  } catch (error) {
    console.error('Error getSalesHistory:', error);
    res.status(500).json({ message: 'Internal server error' });
    next()
  }
};

export const getSalesHistory = async (req, res) => {
  try {
    const users = await modelUser.find().select('_id nama');

    const results = [];

//     const nowWIB     = moment().tz('Asia/Jakarta');
//  const startOfDay = nowWIB.clone().startOf('day').toDate();
//  const endOfDay   = nowWIB.clone().endOf('day').toDate();

  
    for (const user of users) {
      // ambil semua absen masuk (type 'IN') per user, sorted terbaru
      const absenList = await modelAbsen
        .find({ userId: user._id, type: 'IN' })
        .sort({ timestamp: -1 })
        .lean();
        
        const sales = [];
        
        for (const absen of absenList) {
          // tanggal dasar
        const dayStart = new Date(absen.timestamp);
        dayStart.setHours(0,0,0,0);
        const dayEnd = new Date(dayStart.getTime() + 24*60*60*1000);
     
        // ambil semua history OUT/IN untuk user+tanggal itu
        const histories = await modelProdukHistory
            .find({
              user: user._id,
              date: { $gte: dayStart, $lt: dayEnd },
              changeType: { $in: ['OUT','IN'] }
            })
            .populate('product','name sellingPrice')
            .lean();

        // grup per produk
        const prodMap = {};
        histories.forEach(h => {
          const key = h.product._id.toString();
          if (!prodMap[key]) {
            prodMap[key] = {
              name: h.product.name,
              ambil: 0,
              kembali: 0,
              harga: h.product.sellingPrice
            };
          }
          if (h.changeType === 'OUT') prodMap[key].ambil += h.amount;
          if (h.changeType === 'IN')  prodMap[key].kembali += h.amount;
        });

        // format products array
        const products = Object.values(prodMap).map(p => ({
          name: p.name,
          ambil: p.ambil,
          kembali: p.kembali,
          revenue: (p.ambil - p.kembali) * p.harga
        }));

        sales.push({
          date: dayStart.toISOString().split('T')[0],
          absenMasuk: absen.timestamp.toTimeString().split(' ')[0].slice(0,5),
          products
        });
      }

      results.push({
        id: user._id.toString(),
        name: user.nama,
        sales
      });
    }

    res.json(results);
  } catch (error) {
    console.error('Error getSalesHistory:', error);
    res.status(500).json({ message: 'Internal server error' });
    next()
  }
};