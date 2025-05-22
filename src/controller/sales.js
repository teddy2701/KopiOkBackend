import mongoose from "mongoose";
import modelProduk from "../model/modelProduk.js";
import modelSales from "../model/modelSales.js";
import modelProdukHistory from "../model/modelProdukHistory.js";
import modelUser from "../model/modelUser.js";
import modelAbsen from "../model/modelAbsen.js";
import moment from "moment-timezone";
import modelPengambilan from "../model/modelPengambilan.js";
import modelBahanBaku from "../model/modelBahanBaku.js";
import modelPengembalian from "../model/modelPengembalian.js";
import modelPenjualanFinal from "../model/modelPenjualanFinal.js";
import modelPenjualanTemp from "../model/modelPenjualanTemp.js";

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

export const createPengambilan = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      userId,
      note = '',
      uangPecah = 0,
      materials = [],
      products = []
    } = req.body;

    if (!materials.length && !products.length) {
      return res.status(400).json({ message: 'Harap masukkan material atau produk' });
    }

    // 1) Proses direct materials
    const directMaterials = [];
    for (const { materialId, quantity } of materials) {
      const mat = await modelBahanBaku.findById(materialId).session(session);
      if (!mat) throw new Error(`Material ${materialId} tidak ditemukan`);
      if (mat.stock < quantity) throw new Error(`Stok ${mat.name} tidak cukup`);
      mat.stock -= quantity;
      await mat.save({ session });
      directMaterials.push({ material: materialId, quantity });
    }

    // 2) Proses products beserta bahan resep
    const productItems = [];
    for (const { productId, quantity } of products) {
      const prod = await modelProduk.findById(productId)
        .populate('recipe.material')
        .session(session);
      if (!prod) throw new Error(`Produk ${productId} tidak ditemukan`);

      const materialsUsed = [];
      for (const ing of prod.recipe) {
        const needed = ing.amountPerUnit * quantity;
        if (ing.material.stock < needed) {
          throw new Error(
            `Stok ${ing.material.name} tidak cukup untuk ${prod.name} (dibutuhkan ${needed}${ing.material.unit})`
          );
        }
        // kurangi stock resep
        ing.material.stock -= needed;
        await ing.material.save({ session });
        materialsUsed.push({
          material:   ing.material._id,
          amountUsed: needed,
          unit:       ing.material.unit
        });
      }

      productItems.push({
        product:       productId,
        quantity,
        materialsUsed
      });
    }

    // 3) Simpan Pengambilan
    const [pengambilan] = await modelPengambilan.create([{
      user:           userId,
      note,
      uangPecah,
      directMaterials,
      productItems,
      status: 'active'
    }], { session });

    await session.commitTransaction();
    res.status(201).json({ success: true, pengambilan });

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

export const createPengembalian = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, penjualanFinalId, materials = [], products = [] } = req.body;
    // 1) Restore direct materials
    const directMaterials = [];
    for (let { materialId, quantity } of materials) {
      let mat = await modelBahanBaku.findById(materialId).session(session);
      mat.stock += quantity;
      await mat.save({ session });
      directMaterials.push({ material: materialId, quantity });
    }
    // 2) Restore via produk
    const productItems = [];
    for (let { productId, quantity } of products) {
      let prod = await modelProduk.findById(productId).populate('recipe.material').session(session);
      const materialsRestored = [];
      for (let ing of prod.recipe) {
        let mat = ing.material;
        let toRestore = ing.amountPerUnit * quantity;
        mat.stock += toRestore;
        await mat.save({ session });
        materialsRestored.push({
          material:       mat._id,
          amountRestored: toRestore,
          unit:           mat.unit
        });
      }
      productItems.push({ product: productId, quantity, materialsRestored });
    }
    // 3) Simpan
    const [retur] = await modelPengembalian.create([{
      user:           userId,
      penjualanFinal: penjualanFinalId,
      directMaterials,
      productItems
    }], { session });
    await session.commitTransaction();
    res.status(201).json({ success: true, retur });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
}

export const getPenjualanTemp = async (req, res, next) => {
  try {
    const userId = req.params.id;
    let temp = await modelPenjualanTemp.find({ user: userId }).populate('items.product');
    if (!temp) {
      return res.status(404).json({ message: 'Belum ada penjualan sementara' });
    }
    res.json(temp);
  } catch (err) {
    next(err);
  }
};

export const getPengambilanID = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const temp = await modelPengambilan.find({ user: userId, status: "active" });
  
    res.json(temp);
  } catch (err) {
    next(err);
  }
};



export const createPenjualanTemp  = async (req, res, next) => {
  try {
    const { userId, pengambilan, items } = req.body;
    if (!pengambilan) return res.status(400).json({ message: 'Belum melakukan pengembalian barang' });

    const populated = await Promise.all(items.map(async i => {
      const prod = await modelProduk.findById(i.productId);
      if (!prod) throw new Error(`Produk ${i.productId} tidak ditemukan`);
      return { product: prod._id, quantity: i.quantity };
    }));

    const temp = await modelPenjualanTemp.create({
      user:        userId,
      pengambilan: pengambilan,
      items:       populated
    });

    res.status(201).json(temp);
  } catch (err) {
    next(err);
  }
}

export const savePenjualanTemp = async (req, res, next) => {
  try {
    const { items } = req.body;
    const tempId = req.params.id;

    // Map item payload
    const populatedItems = await Promise.all(items.map(async item => {
      const prod = await modelProduk.findById(item.productId);
      if (!prod) throw new Error(`Produk ${item.productId} tidak ditemukan`);
      return { product: prod._id, quantity: item.quantity };
    }));

    // Cari by ID, bukan by user
    const temp = await modelPenjualanTemp.findById(tempId);
    if (!temp) {
      return res.status(404).json({ message: `PenjualanTemp ${tempId} tidak ditemukan` });
    }

    temp.items = populatedItems;
    temp.updatedAt = Date.now();
    await temp.save();

    res.status(200).json(temp);
  } catch (err) {
    next(err);
  }
};

export const finalizePenjualan = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, tempIds, pengeluaran, note } = req.body;

    if(pengeluaran && note=="") {
      return res.status(400).json({ message: 'Catatan pengeluaran tidak boleh kosong' });
    }

    if (!Array.isArray(tempIds) || !tempIds.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'tempIds is required' });
    }

    // Ambil semua temp sales
    const temps = await modelPenjualanTemp
      .find({ _id: { $in: tempIds }, user: userId })
      .populate('items.product')
      .session(session);
    if (!temps.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Tidak ada penjualan sementara ditemukan' });
    }

    // Agregasi jumlah per produk
    const aggMap = {}; // productId -> { quantity, price }
    temps.forEach(t => {
      t.items.forEach(it => {
        const pid = it.product._id.toString();
        if (!aggMap[pid]) {
          aggMap[pid] = { product: it.product._id, quantity: 0, price: it.product.sellingPrice };
        }
        aggMap[pid].quantity += it.quantity;
      });
    });
    const items = Object.values(aggMap);
    const total = items.reduce((sum, it) => sum + it.quantity * it.price, 0);
    
    // Buat satu dokumen PenjualanFinal
    const [finalDoc] = await modelPenjualanFinal.create([{
      user:     userId,
      pengambilanId: temps[0].pengambilan, 
      pengeluaran: pengeluaran || 0,
      notePengeluaran: pengeluaran ? note : ' ',
      items,
      total,
      completedAt: new Date()
    }], { session });

    // Hapus semua temp sales yang digabung
    await modelPenjualanTemp.deleteMany({ _id: { $in: tempIds } }).session(session);

    await session.commitTransaction();
    session.endSession();

    console.log(finalDoc)
    return res.status(200).json({
      message: 'Batch penjualan selesai',
      final: finalDoc
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return next(err);
  }
};

export const getFinalSale = async (req, res, next) => {
  try {
    const userId = req.params.id;

    // 1) Ambil semua Pengambilan milik user dengan status 'jualan'
    const pengambilans = await modelPengambilan
      .find({ user: userId, status: 'active' })
      .lean();

      
      const idPenjualanFinal = await modelPenjualanFinal.findOne({ pengambilanId: pengambilans[0]._id, user: userId }).lean();
      const options = [];
      
    for (const p of pengambilans) {
      // a) Direct materials list
      const materials = [];
      if (Array.isArray(p.directMaterials)) {
        // fetch material names
        const matIds = p.directMaterials.map(dm => dm.material);
        const matDocs = await modelBahanBaku.find({ _id: { $in: matIds } }).lean();
        const matMap = matDocs.reduce((m, doc) => {
          m[doc._id.toString()] = doc;
          return m;
        }, {});
        for (const dm of p.directMaterials) {
          const doc = matMap[dm.material.toString()];
          materials.push({
            materialId: dm.material,
            name:       doc?.name || '',
            unit:       doc?.unit || '',
            quantity:   dm.quantity
          });
        }
      }

      // b) Products list
      const products = [];
      if (Array.isArray(p.productItems)) {
        // fetch product names
        const prodIds = p.productItems.map(pi => pi.product);
        const prodDocs = await modelProduk.find({ _id: { $in: prodIds } }).lean();
        const prodMap = prodDocs.reduce((m, doc) => {
          m[doc._id.toString()] = doc;
          return m;
        }, {});
        for (const pi of p.productItems) {
          const doc = prodMap[pi.product.toString()];
          products.push({
            productId: pi.product,
            name:      doc?.name || '',
            quantity:  pi.quantity
          });
        }
      }

      options.push({
        pengambilanId: p._id,
        penjualanFinalID: idPenjualanFinal._id,
        uangPecah:     p.uangPecah,
        materials,
        products
      });
    }

    return res.json({ options });

  } catch (err) {
    next(err);
  }
};

export const createReturn = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, penjualanFinalId,  pengambilanId, note = '', materials = [], products = []} = req.body;
    if (!userId || !pengambilanId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'userId dan pengambilanId wajib diisi' });
    }

    // 1) Proses pengembalian bahan baku
    const directMaterials = [];
    for (const { materialId, quantity } of materials) {
      const mat = await modelBahanBaku.findById(materialId).session(session);
      if (!mat) throw new Error(`Material ${materialId} tidak ditemukan`);
      mat.stock += quantity;
      await mat.save({ session });
      directMaterials.push({ material: materialId, quantity });
    }

    // 2) Proses pengembalian produk
    const productItems = [];
    for (const { productId, quantity } of products) {
      const prod = await modelProduk.findById(productId).session(session);
      if (!prod) throw new Error(`Produk ${productId} tidak ditemukan`);
      prod.stock = (prod.stock || 0) + quantity;
      await prod.save({ session });
      productItems.push({ product: productId, quantity });
    }
   
    // // 3) Simpan dokumen Pengembalian
    // const [retur] = await modelPengembalian.create([{
    //   user:            userId,
    //   pengambilanId:     pengambilanId,
    //   penjualanFinalId: penjualanFinalId,
    //   note,
    //   directMaterials,   // [{ material, quantity }]
    //   productItems       // [{ product, quantity }]
    // }], { session });

     const retur = [{
      user:            userId,
      pengambilanId:     pengambilanId,
      penjualanFinalId: penjualanFinalId,
      note,
      directMaterials,   // [{ material, quantity }]
      productItems       // [{ product, quantity }]
    }]
    
    console.log(retur)
    // // 4) Tandai Pengambilan sudah diretur
    // await modelPengambilan
    //   .findByIdAndUpdate(pengambilanId,
    //     { status: 'completed' },
    //     { session }
    //   );

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({ message: 'Pengembalian berhasil', retur });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return next(err);
  }
};


export const getLaporanHarian = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ message: 'Permintaan Ditolak' });
    }

    const transaksi = await modelPenjualanFinal
      .findById(id)
      .populate('items.product', 'name sellingPrice');

    if (!transaksi) {
      return res.status(404).json({ message: 'Tidak ada transaksi' });
    }

    // Agregasi per produk
    const produkMap = new Map();
    let totalPendapatan = 0;
    const totalPengeluaran = Number(transaksi.pengeluaran) || 0;
    const catatanPengeluaran = [];

    if (totalPengeluaran > 0) {
      catatanPengeluaran.push({
        jumlah: totalPengeluaran,
        catatan: transaksi.notePengeluaran || ''
      });
    }

    for (const item of transaksi.items) {
      const pid = item.product._id.toString();
      const harga = Number(item.product.sellingPrice) || 0;
      const qty   = Number(item.quantity) || 0;
      const totalItem = harga * qty;

      if (produkMap.has(pid)) {
        const e = produkMap.get(pid);
        e.jumlah += qty;
        e.total  += totalItem;
      } else {
        produkMap.set(pid, {
          nama:   item.product.name,
          harga,
          jumlah: qty,
          total:  totalItem
        });
      }

      totalPendapatan += totalItem;
    }

    // Format respons
    const produk = Array.from(produkMap.values()).map(p => ({
      nama:          p.nama,
      jumlah:        p.jumlah,
      harga:         p.harga,
      total:         p.total,
      displayHarga:  `Rp ${p.harga.toLocaleString('id-ID')}`,
      displayTotal:  `Rp ${p.total.toLocaleString('id-ID')}`
    }));

    const ringkasan = {
      numericPendapatan:  totalPendapatan,
      numericPengeluaran: totalPengeluaran,
      displayPendapatan:  `Rp ${totalPendapatan.toLocaleString('id-ID')}`,
      displayPengeluaran: `Rp ${totalPengeluaran.toLocaleString('id-ID')}`,
      catatanPengeluaran
    };

    return res.json({ produk, ringkasan });
  } catch (err) {
    console.error('Error getLaporanHarian:', err);
    return res.status(500).json({
      message: 'Terjadi kesalahan server',
      error: err.message
    });
  }
};
