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
    console.log(err);
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
      const nowWIB = moment().tz("Asia/Jakarta");
      // const pickupDate = moment(lastOut.date).tz('Asia/Jakarta').startOf('day');
      // const todayWIB = nowWIB.clone().startOf('day');
      // if (!pickupDate.isSame(todayWIB)) {
      //   throw new Error(
      //     `Pengembalian hanya dapat dilakukan pada tanggal pickup: ${pickupDate}`
      //   );
      // }

      // Cek existing return dengan rentang waktu WIB
      const startOfDay = nowWIB.clone().startOf("day").toDate();
      const endOfDay = nowWIB.clone().endOf("day").toDate();

      const existingReturn = await modelProdukHistory
        .findOne({
          product: productId,
          user: userId,
          changeType: "IN",
          date: { $gte: startOfDay, $lt: endOfDay },
        })
        .session(session);

      if (existingReturn) {
        throw new Error(
          `Anda sudah melakukan pengembalian untuk ${product.name} hari ini`
        );
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
        // Validasi ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({ message: "ID User tidak valid" });
        }
    
        // Hitung tanggal 30 hari yang lalu
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
    
        // Query database
        const penjualan = await modelPenjualanFinal
          .find({
            user: id,
            completedAt: { $gte: startDate }
          }).select("items completedAt").populate('items.product', 'name') // Populate data produk
          .sort({ completedAt: -1 }) // Urutkan dari tanggal terbaru
          .lean()
          .exec();

         
    
        if (!penjualan || penjualan.length === 0) {
          return res.status(404).json({ 
            message: "Tidak ditemukan data penjualan dalam 30 hari terakhir" 
          });
        }
          res.status(200).json({
            penjualan: penjualan.map(transaction => ({
              ...transaction,
              items: transaction.items.map(item => ({
                ...item,
                product: {
              
                  name: item.product?.name || "Produk Dihapus",
                }
              }))
            }))
          });
  } catch (error) {
    console.error("Error getSalesHistory:", error);
    res.status(500).json({ message: "Internal server error" });
    next();
  }
};

export const getSalesHistory = async (req, res) => {
  try {
    const historyPenjualan = await modelPenjualanFinal.find()
    .select("completedAt items")
    .populate({
      path: 'items.product',
      select: 'typeProduk',
      model: 'Produk'
    })
    .lean();

  // Aggregasi data per tanggal
  const aggregatedData = historyPenjualan.reduce((acc, transaction) => {
    const tanggal = moment(transaction.completedAt)
      .tz('Asia/Jakarta')
      .format('DD/MM/YYYY');
    
    const existingEntry = acc.find(entry => entry.tanggal === tanggal);

    // Hitung per transaksi
    let coffe = 0;
    let nonCoffe = 0;
    let totalCoffe = 0;
    let totalNonCoffe = 0;

    transaction.items.forEach(item => {
      const productType = item.product?.typeProduk;
      if(productType === 'coffe') {
        coffe++;
        totalCoffe += item.quantity;
      } else if(productType === 'nonCoffe') {
        nonCoffe++;
        totalNonCoffe += item.quantity;
      }
    });

    if(existingEntry) {
      // Update existing entry
      existingEntry.coffe += coffe;
      existingEntry.nonCoffe += nonCoffe;
      existingEntry.totalCoffe += totalCoffe;
      existingEntry.totalNonCoffe += totalNonCoffe;
    } else {
      // Buat entry baru
      acc.push({
        tanggal,
        coffe,
        nonCoffe,
        totalCoffe,
        totalNonCoffe
      });
    }

    return acc;
  }, []);

  // Hitung total keseluruhan
  const total = aggregatedData.reduce((sum, entry) => ({
    totalCoffe: sum.totalCoffe + entry.totalCoffe,
    totalNonCoffe: sum.totalNonCoffe + entry.totalNonCoffe
  }), { totalCoffe: 0, totalNonCoffe: 0 });

  res.status(200).json({
    success: true,
    data: {
      harian: aggregatedData,
      total: {
        totalCoffe: total.totalCoffe,
        totalNonCoffe: total.totalNonCoffe,
        grandTotal: total.totalCoffe + total.totalNonCoffe
      }
    }
  });

  } catch (error) {
    console.error("Error getSalesHistory:", error);
    res.status(500).json({ message: "Internal server error" });
    next();
  }
};

export const createPengambilan = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      userId,
      note = "",
      uangPecah = 0,
      materials = [],
      products = [],
    } = req.body;

    if (!materials.length && !products.length) {
      return res
        .status(400)
        .json({ message: "Harap masukkan material atau produk" });
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
      const prod = await modelProduk
        .findById(productId)
        .populate("recipe.material")
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
          material: ing.material._id,
          amountUsed: needed,
          unit: ing.material.unit,
        });
      }

      productItems.push({
        product: productId,
        quantity,
        materialsUsed,
      });
    }

    // 3) Simpan Pengambilan
    const [pengambilan] = await modelPengambilan.create(
      [
        {
          user: userId,
          note,
          uangPecah,
          directMaterials,
          productItems,
          status: "active",
        },
      ],
      { session }
    );

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
    const {
      userId,
      penjualanFinalId,
      materials = [],
      products = [],
    } = req.body;
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
      let prod = await modelProduk
        .findById(productId)
        .populate("recipe.material")
        .session(session);
      const materialsRestored = [];
      for (let ing of prod.recipe) {
        let mat = ing.material;
        let toRestore = ing.amountPerUnit * quantity;
        mat.stock += toRestore;
        await mat.save({ session });
        materialsRestored.push({
          material: mat._id,
          amountRestored: toRestore,
          unit: mat.unit,
        });
      }
      productItems.push({ product: productId, quantity, materialsRestored });
    }
    // 3) Simpan
    const [retur] = await modelPengembalian.create(
      [
        {
          user: userId,
          penjualanFinal: penjualanFinalId,
          directMaterials,
          productItems,
        },
      ],
      { session }
    );
    await session.commitTransaction();
    res.status(201).json({ success: true, retur });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

export const getPenjualanTemp = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const docs = await modelPenjualanTemp
      .find({ user: userId })
      .populate("items.product", "name");

    if (!docs) {
      return res.status(404).json({ message: "Belum ada penjualan sementara" });
    }

    // Map untuk mengakumulasi quantity per product
    const map = new Map();
    docs.forEach((doc) => {
      doc.items.forEach((item) => {
        const pid = item.product._id.toString();
        if (!map.has(pid)) {
          map.set(pid, {
            product: {
              _id: item.product._id,
              name: item.product.name,
            },
            quantity: 0,
          });
        }
        map.get(pid).quantity += item.quantity;
      });
    });

    // Bentuk array items hasil akumulasi
    const items = Array.from(map.values()).map((entry) => ({
      _id: undefined, // jika butuh _id per item, bisa di-generate atau dibiarkan undefined
      product: entry.product,
      quantity: entry.quantity,
    }));

    // 2. Kumpulkan semua ID dokumen
    const documentIds = docs.map(doc => doc._id);


    res.json({
      id: documentIds,
      items,
    });
  } catch (err) {
    console.log(err)
    next(err);
  }
};

export const getPengambilanID = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const temp = await modelPengambilan.find({
      user: userId,
      status: "active",
    });

    res.json(temp);
  } catch (err) {
    next(err);
  }
};

export const createPenjualanTemp = async (req, res, next) => {
  try {
    const { userId, pengambilan, items } = req.body;
    if (!pengambilan)
      return res
        .status(400)
        .json({ message: "Belum melakukan pengembalian barang" });

    const populated = await Promise.all(
      items.map(async (i) => {
        const prod = await modelProduk.findById(i.productId);
        if (!prod) throw new Error(`Produk ${i.productId} tidak ditemukan`);
        return { product: prod._id, quantity: i.quantity };
      })
    );
 
    const temp = await modelPenjualanTemp.create({
      user: userId,
      pengambilan: pengambilan,
      items: populated,
    });

    res.status(201).json(temp);
  } catch (err) {
    next(err);
  }
};

export const savePenjualanTemp = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { items } = req.body;
    const tempId = req.params.id;

     // Cari by ID, bukan by user
     const temp = await modelPenjualanTemp.findById(tempId).select({
      _id: 0,
      user: 1,
      pengambilan: 1,
    }).session(session);

    if (!temp) {
      return res
        .status(404)
        .json({ message: `Penjualan tidak ditemukan` });
    }

    // Map item payload
    const populatedItems = await Promise.all(
      items.map(async (item) => {
        const prod = await modelProduk.findById(item.productId).session(session);;
        if (!prod) throw new Error(`Produk tidak ditemukan`);
        return { product: prod._id, quantity: item.quantity };
      })
    );

    //hapus document lama dengan user dan pengambilan yang sama
      await modelPenjualanTemp.deleteMany({
        user: temp.user,
        pengambilan: temp.pengambilan
      }).session(session);
  

    // Buat dokumen baru dengan field yang diperlukan
    await modelPenjualanTemp.create({
      user: temp.user,
      pengambilan: temp.pengambilan,
      items: populatedItems,
    });

    await session.commitTransaction();

    res.status(200).json({messege: "Data Penjualan berhasil di ubah"});
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

export const finalizePenjualan = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, tempIds, pengeluaran, note } = req.body;

 
    if (pengeluaran && note == "") {
      return res
        .status(400)
        .json({ message: "Catatan pengeluaran tidak boleh kosong" });
    }

    if (!Array.isArray(tempIds) || !tempIds.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "tempIds is required" });
    }

    // Ambil semua temp sales
    const temps = await modelPenjualanTemp
      .find({ _id: { $in: tempIds }, user: userId })
      .populate("items.product")
      .session(session);

     
    if (!temps.length) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ message: "Tidak ada penjualan sementara ditemukan" });
    }

    // Agregasi jumlah per produk
    const aggMap = {}; // productId -> { quantity, price }
    temps.forEach((t) => {
      t.items.forEach((it) => {
        const pid = it.product._id.toString();
        if (!aggMap[pid]) {
          aggMap[pid] = {
            product: it.product._id,
            quantity: 0,
            price: it.product.sellingPrice,
          };
        }
        aggMap[pid].quantity += it.quantity;
      });
    });
    const items = Object.values(aggMap);
    const total = items.reduce((sum, it) => sum + it.quantity * it.price, 0);
    const idPengambilan = [...new Set(
      temps.flatMap(t => t.pengambilan.map(id => id.toString()))
    )];
    console.log("Id Pengambilan: ",idPengambilan);

    // Buat satu dokumen PenjualanFinal
    const [finalDoc] = await modelPenjualanFinal.create(
      [
        {
          user: userId,
          pengambilanId: idPengambilan,
          pengeluaran: pengeluaran || 0,
          notePengeluaran: pengeluaran ? note : " ",
          items,
          total,
          completedAt: new Date(),
        },
      ],
      { session }
    );

    // Hapus semua temp sales yang digabung
    await modelPenjualanTemp
      .deleteMany({ _id: { $in: tempIds }, user: userId  })
      .session(session); 

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "Batch penjualan selesai",
      final: finalDoc,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.log(err)
    return next(err);
  }
};

export const getFinalSale = async (req, res, next) => {
  try {
    const userId = req.params.id;

    // 1) Ambil semua Pengambilan milik user dengan status 'active'
    const pengambilans = await modelPengambilan
      .find({ user: userId, status: "active" })
      .lean();

    if (!pengambilans.length) {
      return res.status(404).json({ message: "Tidak ada pengambilan bahan baku" });
    }

    // 2) Cek penjualan final (disesuaikan dengan bisnis logic yang benar)
    const idPenjualanFinal = await modelPenjualanFinal
      .findOne({ user: userId })
      .sort({ _id: -1 })
      .lean();

  

    if (!idPenjualanFinal) {
      return res.status(404).json({ message: "Tidak ada penjualan ditemukan" });
    }

    // 3) Kumpulkan semua ID material dan produk unik
    const allMaterialIds = [...new Set(
      pengambilans.flatMap(p => 
        p.directMaterials?.map(dm => dm.material.toString()) || []
      )
    )];

    const allProductIds = [...new Set(
      pengambilans.flatMap(p => 
        p.productItems?.map(pi => pi.product.toString()) || []
      )
    )];

    // 4) Query semua material dan produk sekaligus
    const [materialsData, productsData] = await Promise.all([
      modelBahanBaku.find({ _id: { $in: allMaterialIds } }).lean(),
      modelProduk.find({ _id: { $in: allProductIds }, dibuat: true }).lean()
    ]);

    // 5) Buat mapping untuk data
    const materialMap = materialsData.reduce((acc, cur) => {
      acc[cur._id.toString()] = { 
        materialId: cur._id, 
        name: cur.name, 
        unit: cur.unit 
      };
      return acc;
    }, {});

    const productMap = productsData.reduce((acc, cur) => {
      acc[cur._id.toString()] = { 
        productId: cur._id, 
        name: cur.name 
      };
      return acc;
    }, {});

    // 6) Kumpulkan hasil akhir
    const result = {
      materials: Object.values(materialMap),
      products: Object.values(productMap),
      penjualanFinalID: idPenjualanFinal._id
    };

  
    return res.json(result);

  } catch (err) {
    console.log(err);
    next(err);
  }
};

export const createReturn = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      userId,
      penjualanFinalId,
      note = "",
      materials = [],
      products = [],
    } = req.body;

      // Validasi input dasar
      if (!userId || !penjualanFinalId) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: "UserId dan penjualanFinalId wajib diisi" 
        });
      }
  
      // 1. Validasi struktur data input
      const validateItemStructure = (items, type) => {
        if (!Array.isArray(items)) {
          throw new Error(`Format ${type} tidak valid`);
        }
        
        items.forEach((item, index) => {
          const idField = `${type}Id`;
          if (!item?.[idField] || typeof item.quantity !== 'number') {
            throw new Error(
              `Item ${type} ke-${index + 1} tidak valid: ` +
              `Field ${idField} dan quantity wajib diisi`
            );
          }
        });
      };
  
      validateItemStructure(materials, 'material');
      validateItemStructure(products, 'product');
  
      // 2. Ambil semua pengambilan aktif user
      const pengambilans = await modelPengambilan.find({ 
        user: userId, 
        status: 'active' 
      }).session(session).lean();
     
      if (pengambilans.length === 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: "Tidak ada pengambilan aktif ditemukan" 
        });
      }
  
      // 3. Hitung total pengambilan material dan produk
      const totalTaken = { materials: {}, products: {} };
      for (const p of pengambilans) {
        // Material langsung
        p.directMaterials?.forEach(dm => {
          const key = dm.material?.toString?.();
          if (key && dm.quantity) {
            totalTaken.materials[key] = (totalTaken.materials[key] || 0) + dm.quantity;
          }
        });
        
        // Produk
        p.productItems?.forEach(pi => {
          const key = pi.product?.toString?.();
          if (key && pi.quantity) {
            totalTaken.products[key] = (totalTaken.products[key] || 0) + pi.quantity;
          }
        });
      }
  
    // [BARU] 5. Ambil nama material dan produk
    const materialIds = materials.map(m => m.materialId);
    const productIds = products.map(p => p.productId);

    const [materialsData, productsData] = await Promise.all([
      modelBahanBaku.find({ _id: { $in: materialIds } }, 'name').session(session).lean(),
      modelProduk.find({ _id: { $in: productIds } }, 'name').session(session).lean()
    ]);

    const materialNames = materialsData.reduce((acc, cur) => {
      acc[cur._id.toString()] = cur.name;
      return acc;
    }, {});

    const productNames = productsData.reduce((acc, cur) => {
      acc[cur._id.toString()] = cur.name;
      return acc;
    }, {});

    // 6. Validasi jumlah maksimal dengan nama
    const validateQty = (type, items, namesMap) => {
      items.forEach((item) => {
        const id = item[`${type}Id`]?.toString();
        if (!id) throw new Error(`ID ${type} tidak valid`);

        const taken = totalTaken[type + 's']?.[id] || 0;
        // const returned = totalReturned[type + 's']?.[id] || 0;
        // const remaining = taken - returned;
        // console.log("taken: ", taken)
        // console.log("returned: ", returned)

        if (item.quantity > taken) {
          const itemName = namesMap[id] || `[Nama tidak ditemukan]`;
          throw new Error(
            `Jumlah pengembalian "${itemName}" melebihi yang diambil. ` +
            `Maksimal yang bisa dikembalikan: ${taken}`
          );
        }
      });
    };

    validateQty('material', materials, materialNames); // [BARU] passing namesMap
    validateQty('product', products, productNames);     // [BARU] passing namesMap
  
      // 6. Proses pengembalian stok
      const updateStock = async (model, items, type) => {
        for (const item of items) {
          const id = item[`${type}Id`]?.toString();
          if (!id) continue;
  
          const doc = await model.findById(id).session(session);
          if (!doc) throw new Error(`${type} ${id} tidak ditemukan`);
          
          doc.stock += item.quantity;
          await doc.save({ session });
        }
      };

    await updateStock(modelBahanBaku, materials);
    await updateStock(modelProduk, products);

    // 6. Simpan data pengembalian
    const [retur] = await modelPengembalian.create([{
      user: userId,
      penjualanFinalId,
      note,
      directMaterials: materials.map(m => ({
        material: m.materialId,
        quantity: m.quantity
      })),
      productItems: products.map(p => ({
        product: p.productId,
        quantity: p.quantity
      }))
    }], { session });

    // [BARU] 8. Update status semua pengambilan aktif menjadi completed
    await modelPengambilan.updateMany(
      { _id: { $in: pengambilans.map(p => p._id) } },
      { $set: { status: 'completed' } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({ 
      message: "Pengembalian berhasil",
      retur 
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.log(err)
    return res.status(400).json({
      message: err.message.includes('melebihi') 
        ? err.message 
        : 'Gagal memproses pengembalian'
    });
  }
};

export const getLaporanHarian = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ message: "Permintaan Ditolak" });
    }

    const transaksi = await modelPenjualanFinal
      .findById(id)
      .populate("items.product", "name sellingPrice typeProduk");

    if (!transaksi) {
      return res.status(404).json({ message: "Tidak ada transaksi" });
    }

    let ambilUang = 0;

    for(const pengambilan of transaksi.pengambilanId){
      // 1. Ambil data pengambilan
    const pengambilanUang = await modelPengambilan
    .findById(pengambilan)
    .select("uangPecah")
    .lean();

     // 2. Cek jika dokumen atau uangPecah tidak ada/null
     if (!pengambilanUang?.uangPecah) {
      continue; // Lewati iterasi ini
    }
    // 3. Pastikan uangPecah adalah angka
    const uangPecahNumber = Number(pengambilanUang.uangPecah);
    
    if (!isNaN(uangPecahNumber)) {
      ambilUang += uangPecahNumber;
     
    } 
    }
      
    // Agregasi per produk
    const produkMap = new Map();
    let totalPendapatan = 0;
    const totalPengeluaran = Number(transaksi.pengeluaran) || 0;
    const catatanPengeluaran = [];

    if (totalPengeluaran > 0) {
      catatanPengeluaran.push({
        jumlah: totalPengeluaran,
        catatan: transaksi.notePengeluaran || "",
      });
    }

    for (const item of transaksi.items) {
      console.log("data item:",item)
      const pid = item.product._id.toString();
      const harga = Number(item.product.sellingPrice) || 0;
      const qty = Number(item.quantity) || 0;
      const totalItem = harga * qty;

      if (produkMap.has(pid)) {
        const e = produkMap.get(pid);
        e.jumlah += qty;
        e.total += totalItem;
      } else {
        produkMap.set(pid, {
          nama: item.product.name,
          harga,
          jumlah: qty,
          type: item.product.typeProduk || "coffe",
          total: totalItem,
        });
      }

      totalPendapatan += totalItem;
    }

    // Format respons
    const produk = Array.from(produkMap.values()).map((p) => ({
      nama: p.nama,
      jumlah: p.jumlah,
      harga: p.harga,
      total: p.total,
      type: p.type,
      displayHarga: `Rp ${p.harga.toLocaleString("id-ID")}`,
      displayTotal: `Rp ${p.total.toLocaleString("id-ID")}`,
    }));

    const ringkasan = {
      numericPendapatan: totalPendapatan,
      numericPengeluaran: totalPengeluaran,
      displayPendapatan: `Rp ${totalPendapatan.toLocaleString("id-ID")}`,
      displayPengeluaran: `Rp ${totalPengeluaran.toLocaleString("id-ID")}`,
      catatanPengeluaran,
      uangPecah: ambilUang,
    };

    return res.json({ produk, ringkasan });
  } catch (err) {
    console.error("Error getLaporanHarian:", err);
    return res.status(500).json({
      message: "Terjadi kesalahan server",
      error: err.message,
    });
  }
};


export const getTotalPendapatan = async (req, res) => {
  try {
    // Hitung tanggal default (2 bulan terakhir)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 2);

    // Ambil tanggal dari query jika ada
    const filterStartDate = req.query.startDate 
      ? new Date(req.query.startDate) 
      : startDate;
    
    const filterEndDate = req.query.endDate 
      ? new Date(req.query.endDate) 
      : endDate;

      console.log("hari mulai: ", filterStartDate)
      console.log ("hari akhir: ", filterEndDate)
    // Pipeline agregasi
    const pipeline = [
      {
        $match: {
          completedAt: {
            $gte: filterStartDate,
            $lte: filterEndDate
          }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userData"
        }
      },
      { $unwind: "$userData" },
      {
        $project: {
          date: {
            $dateToString: { format: "%d-%m-%Y", date: "$completedAt" }
          },
          username: "$userData.username",
          total: { $subtract: ["$total", "$pengeluaran"] }
        }
      },
      {
        $group: {
          _id: {
            date: "$date",
            username: "$username"
          },
          userTotal: { $sum: "$total" }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          users: {
            $push: {
              username: "$_id.username",
              total: "$userTotal"
            }
          },
          total: { $sum: "$userTotal" }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const aggregationResult = await modelPenjualanFinal.aggregate(pipeline);

    
    // Transformasi hasil agregasi
    const formattedResult = aggregationResult.map(dateGroup => ({
      date: dateGroup._id,
      total: dateGroup.total,
      users: dateGroup.users.map(user => ({
        username: user.username,
        total: user.total
      }))
    }));

    // Hitung total keseluruhan
    const totalKeseluruhan = formattedResult.reduce(
      (sum, item) => sum + item.total, 
      0
    );

    res.status(200).json({
      data: formattedResult,
      totalKeseluruhan
    });
  } catch (error) {
    console.error("Error getTotalPendapatan:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getSalesReport = async (req, res) => {
  try {
    const userId = req.params.id;
    // 1. Hitung rentang tanggal default (2 bulan terakhir)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 2);

    // Ambil tanggal dari query jika ada
    const filterStartDate = req.query.startDate 
      ? new Date(req.query.startDate) 
      : startDate;
    
    const filterEndDate = req.query.endDate 
      ? new Date(req.query.endDate) 
      : endDate;

    // 4. Query database untuk penjualan dalam rentang waktu
    const penjualanList = await modelPenjualanFinal.find({
      user: userId,
      completedAt: { $gte: filterStartDate, $lte: filterEndDate }
    }).populate({
      path: 'items.product',
      select: 'typeProduk'
    });

    // 5. Inisialisasi struktur data
    const salesByDay = {};
    let totalCoffee = 0;
    let totalNonCoffee = 0;
    let totalRevenue = 0;

    // 6. Proses setiap transaksi penjualan
    for (const penjualan of penjualanList) {
      const dateKey = penjualan.completedAt.toISOString().split('T')[0];
      
      if (!salesByDay[dateKey]) {
        salesByDay[dateKey] = {
          date: dateKey,
          coffeeSales: 0,
          nonCoffeeSales: 0,
          revenue: 0
        };
      }

      // Tambahkan revenue transaksi
      salesByDay[dateKey].revenue += penjualan.total;
      totalRevenue += penjualan.total;

      // Proses setiap item dalam transaksi
      for (const item of penjualan.items) {
        if (item.product && item.product.typeProduk === 'nonCoffe') {
          salesByDay[dateKey].coffeeSales += item.quantity;
          totalNonCoffee += item.quantity;
        } else {
          salesByDay[dateKey].nonCoffeeSales += item.quantity;
          totalCoffee += item.quantity;
        }
      }
    }

    // 7. Konversi ke array dan urutkan berdasarkan tanggal
    const dailySales = Object.values(salesByDay).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    // 8. Format response
    res.status(200).json({
      success: true,
      data: {
        dailySales,
        totals: {
          totalCoffee,
          totalNonCoffee,
          totalRevenue
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
