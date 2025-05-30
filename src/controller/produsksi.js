import modelBahanBaku from "../model/modelBahanBaku.js";
import modelBahanBakuHistory from "../model/modelBahanBakuHistory.js";
import modelProduk from "../model/modelProduk.js";
import mongoose from "mongoose";
import modelProduksi from "../model/modelProduksi.js";
import modelPengambilan from "../model/modelPengambilan.js";
import modelUser from "../model/modelUser.js";
import modelPengembalian from "../model/modelPengembalian.js";

/**
 * @desc   Kurangi stok bahan baku (dipanggil saat produksi)
 * @param  materialId, amount, note
 * @returns void
 */


const consumeMaterial = async (
    materialId,
    amount,
    note = "Used in production"
  ) => {
  
      const material = await modelBahanBaku.findById(materialId);
      if (!material) throw new Error("Material tidak ditemukan.");
      if (material.stock < amount)
        throw new Error(`Stok ${material.name} tidak cukup`);
  
      material.stock -= amount;
      await material.save();
  
      await modelBahanBakuHistory.create({
        material: material._id,
        changeType: "OUT",
        amount,
        note,
      });
    
  };


/**
 * @desc   Get all materials
 * @route  GET /api/materials
 * @access Public (or Protected)
 */
export const getMaterials = async (req, res, next) => {
    try {
      const materials = await modelBahanBaku.find().sort({ name: 1 });
      res.json(materials);
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Terjadi kesalahan pada server" });
      next(error);
    }
  };

/**
 * @desc   Create a new material
 * @route  POST /api/materials
 * @access Protected
 */

export const createBahanBaku = async (req, res) => {
  const { name, unit, stock, price } = req.body;
  try {
    let material = await modelBahanBaku.findOne({ name });
    if (material) {
      return res.status(400).json({
        message:
          "Material sudah terdaftar, silakan gunakan nama lain atau update material yang ada.",
      });
    }
    material = await modelBahanBaku.create({ name, unit, stock, price });
    // Record history: initial stock IN
    await modelBahanBakuHistory.create({
      material: material._id,
      changeType: "IN",
      amount: stock,
      price,
      note: "Initial stock",
    });
    res
      .status(201)
      .json({ message: "Material berhasil ditambahkan", material });
  } catch (error) {
    res.status(500).json({ message: error.message });
    console.log(error);
    next();
  }
};

/**
 * @desc   Tambah stok bahan baku
 * @route  PUT /api/materials/:id/stock
 * @access Protected
 */

export const addMaterialStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { additionalStock, price, note } = req.body;
    if (additionalStock <= 0) {
      return res
        .status(400)
        .json({ message: "Nilai tambahan stok harus lebih dari nol." });
    }
    if (price == null || price <= 0) {
      return res
        .status(400)
        .json({
          message: "Price untuk stok baru harus diberikan dan lebih dari nol.",
        });
    }
    const material = await modelBahanBaku.findById(id);
    if (!material) {
      return res.status(404).json({ message: "Material tidak ditemukan." });
    }
    // Update stok
    material.stock += additionalStock;
    material.price = price;
    await material.save();
    // Record history: stock IN
    await modelBahanBakuHistory.create({
      material: material._id,
      changeType: "IN",
      amount: additionalStock,
      price,
      note: note || "Restock",
    });
    res.json(material);
  } catch (error) {
    res.status(500).json({ message: error.message });
    console.log(error);
  }
};


export const getProducts = async (req, res, next) => {
    try {
      const products = await modelProduk.find()
        .populate('recipe.material', 'name unit')
        .sort({ name: 1 });
      res.json(products);
    } catch (err) {
    console.log(err)
      next(err);
    }
  };

  export const createProduct = async (req, res, next) => {
    try {
      const { name, recipe, sellingPrice, restockable, type } = req.body;

      if (!name || !Array.isArray(recipe) || recipe.length === 0 || !sellingPrice) {
        return res.status(400).json({ message: 'Name, recipe and sellingPrice are required.' });
      }
      const product = await modelProduk.create({ name, recipe, sellingPrice, dibuat:restockable, typeProduk:type });
      res.status(201).json(product);
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({ message: 'Produk sudah ada' });
      }
      next(err);
    console.log(err)

    }
  };

/**
 * @desc   Create a new production record, consume materials, and increase product stock
 * @route  POST /api/productions
 * @access Protected
 */
export const createProduction = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { productId, quantity } = req.body;
      if (!productId || !quantity || quantity <= 0) {
        return res.status(400).json({ message: 'productId and positive quantity required.' });
      }
  
      // Load product with recipe
      const product = await modelProduk.findById(productId).populate('recipe.material').session(session);
      console.log(product)
      if (!product) {
        return res.status(404).json({ message: 'Product tidak ditemukan.' });
      }
  
      // Consume each material
      const usedMaterials = [];
       // Conversion factors: base unit to smallest (for kg, liter)
    const unitFactor = { kg: 1000, gram: 1, liter: 1000, pcs: 1 };

    for (const item of product.recipe) {
      const mat = item.material;
      // Calculate total usage in material's stock unit
      let totalUsed = item.amountPerUnit * quantity;
      // If material unit differs, convert assuming recipe amountPerUnit is in smallest unit
      if (mat.unit === 'kg' || mat.unit === 'liter') {
        // amountPerUnit interpreted in gram/ml, convert to kg/L
        totalUsed = (item.amountPerUnit * quantity) / unitFactor[mat.unit];
      
      }
      if (mat.stock < totalUsed) {
        throw new Error(`Stok ${mat.name} tidak cukup`);
      }
      // Consume material and record history
      await consumeMaterial(mat._id, totalUsed, `Produksi ${quantity} x ${product.name}`);
      usedMaterials.push({ material: mat._id, totalUsed });
    }

      // Update product stock
      product.stock += quantity;
      await product.save({ session });
  
      // Record production
      const production = await modelProduksi.create([{
        product: productId,
        quantity,
        usedMaterials,
        totalRevenue: product.sellingPrice * quantity
      }], { session });
  
      await session.commitTransaction();
      res.status(201).json(production[0]);
    } catch (error) {
      await session.abortTransaction();
      next(error);
    } finally {
      session.endSession();
    }
  };

  /**
 * @desc   Get all productions with populated product data
 * @route  GET /api/productions
 * @access Public or Protected
 */
export const getProductions = async (req, res, next) => {
  try {
    const productions = await modelProduksi.find()
      .populate('product', 'name sellingPrice')
      .sort({ createdAt: -1 });
    res.json(productions);
  } catch (err) {
    next(err);
  }
};

  /**
 * @desc   Get only products with stock > 0 for sales
 * @route  GET /api/products/available
 */
// export const getAvailableProducts = async (req, res, next) => {
//   try {
//     const products = await modelProduk.find({ stock: { $gt: 0 } })
//       .select('name stock sellingPrice')
//       .sort({ name: 1 });
//     res.json(products);
//   } catch (error) {
//     next(error);
//   }
// };

export const getProductsForCashier = async (req, res, next) => {
  try {
    const products = await modelProduk.find()
      .select('_id name sellingPrice') // Hanya ambil field yang diperlukan
      .sort({ name: 1 });
     
    res.json(products);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
    next(error);
  }
};
export const getPengambilanData = async (req, res, next) => {
  try {
    // Ambil semua bahan baku yang tersedia
    const materials = await modelBahanBaku.find().select('_id name stock unit').sort({ name: 1 });

    // Ambil semua produk beserta resepnya
    const produk = await modelProduk.find()
      .select('_id name stock sellingPrice recipe dibuat')
      .populate('recipe.material', 'name unit')
      .sort({ name: 1 });

    const filter = produk.filter((item) => item.dibuat === true || item.stock > 0);
    console.log(filter)
    
    res.json({
      materials,
      products:filter
    });
  } catch (error) {
    console.error("Error saat ambil data pengambilan:", error);
    res.status(500).json({ message: "Gagal mengambil data pengambilan." });
    next(error);
  }
};

// Controller untuk menampilkan riwayat pengambilan per user dengan filter tanggal
export const getRiwayatPengambilanUser = async (req, res) => {
  try {
    const { userId } = req.params;
    let { startDate, endDate } = req.query;

    // Cek apakah user ada
    const user = await modelUser.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan"
      });
    }

    // Set rentang tanggal default (7 hari terakhir)
    const endDateObj = endDate ? new Date(endDate) : new Date();
    const startDateObj = startDate ? new Date(startDate) : new Date();
    startDateObj.setDate(endDateObj.getDate() - 7);

    // Atur waktu untuk mencakup seluruh hari
    startDateObj.setHours(0, 0, 0, 0);
    endDateObj.setHours(23, 59, 59, 999);

    // Query data pengambilan dengan filter tanggal
    const pengambilanList = await modelPengambilan.find({
      user: userId,
      date: {
        $gte: startDateObj,
        $lte: endDateObj
      }
    })
    .sort({ date: -1 })
    .populate({
      path: 'user',
      select: 'nama areaPenjualan'
    })
    .populate({
      path: 'directMaterials.material',
      select: 'name unit' // Hanya ambil field yang diperlukan
    })
    .populate({
      path: 'productItems.product',
      select: 'name typeProduk' // Hanya ambil field yang diperlukan
    })
    .populate({
      path: 'productItems.materialsUsed.material',
      select: 'name unit' // Hanya ambil field yang diperlukan
    });

    // Hitung ringkasan statistik
    let totalPengambilan = pengambilanList.length;
    let totalUangPecah = 0;
    const materialStatistik = {};
    const produkStatistik = {};

    // Format data dan hitung statistik
    const formattedData = pengambilanList.map(pengambilan => {
      totalUangPecah += pengambilan.uangPecah || 0;
      
      // Hitung material langsung
      const materialLangsung = pengambilan.directMaterials.map(item => {
        const materialId = item.material._id.toString();
        
        if (!materialStatistik[materialId]) {
          materialStatistik[materialId] = {
            nama: item.material.name,
            satuan: item.material.unit,
            jumlah: 0
          };
        }
        materialStatistik[materialId].jumlah += item.quantity;
        
        return {
          namaMaterial: item.material.name,
          satuan: item.material.unit,
          jumlah: item.quantity
        };
      });
      
      // Hitung material melalui produk
      const produkItems = pengambilan.productItems.map(item => {
        // Statistik produk
        const produkId = item.product._id.toString();
        if (!produkStatistik[produkId]) {
          produkStatistik[produkId] = {
            nama: item.product.name,
            jenis: item.product.typeProduk,
            jumlah: 0
          };
        }
        produkStatistik[produkId].jumlah += item.quantity;
        
        const bahanDipakai = item.materialsUsed.map(materialItem => {
          const materialId = materialItem.material._id.toString();
          
          if (!materialStatistik[materialId]) {
            materialStatistik[materialId] = {
              nama: materialItem.material.name,
              satuan: materialItem.material.unit,
              jumlah: 0
            };
          }
          materialStatistik[materialId].jumlah += materialItem.amountUsed;
          
          return {
            namaMaterial: materialItem.material.name,
            satuan: materialItem.material.unit,
            jumlahDipakai: materialItem.amountUsed
          };
        });
        
        return {
          namaProduk: item.product.name,
          jenis: item.product.typeProduk,
          jumlahProduk: item.quantity,
          bahanDipakai
        };
      });
      
      return {
        _id: pengambilan._id,
        tanggal: pengambilan.date,
        catatan: pengambilan.note || '-',
        uangPecah: pengambilan.uangPecah || 0,
        status: pengambilan.status,
        materialLangsung,
        produkItems
      };
    });
    
    // Format statistik material
    const materialTerbanyak = Object.values(materialStatistik)
      .sort((a, b) => b.jumlah - a.jumlah)
      .slice(0, 5);
    
    // Format statistik produk
    const produkTerbanyak = Object.values(produkStatistik)
      .sort((a, b) => b.jumlah - a.jumlah)
      .slice(0, 5);
    
    res.status(200).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          nama: user.nama,
          areaPenjualan: user.areaPenjualan
        },
        rentangTanggal: {
          start: startDateObj,
          end: endDateObj
        },
        ringkasan: {
          totalPengambilan,
          totalUangPecah,
          materialTerbanyak,
          produkTerbanyak
        },
        riwayat: formattedData
      }
    });
    
  } catch (error) {
    console.error("Error fetching pengambilan history:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
      error: error.message
    });
  }
};

export const getRiwayatPengembalianUser = async (req, res) => {
  try {
    const { userId } = req.params;
    let { startDate, endDate } = req.query;

    // Cek apakah user ada
    const user = await modelUser.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan"
      });
    }

    // Set rentang tanggal default (7 hari terakhir)
    const endDateObj = endDate ? new Date(endDate) : new Date();
    const startDateObj = startDate ? new Date(startDate) : new Date();
    if (!startDate) startDateObj.setDate(endDateObj.getDate() - 7);

    // Atur waktu untuk mencakup seluruh hari
    startDateObj.setHours(0, 0, 0, 0);
    endDateObj.setHours(23, 59, 59, 999);

    // Query data pengembalian dengan filter tanggal
    const pengembalianList = await modelPengembalian.find({
      user: userId,
      createdAt: {
        $gte: startDateObj,
        $lte: endDateObj
      }
    })
    .sort({ createdAt: -1 }) // Urutkan dari yang terbaru
    .populate({
      path: 'user',
      select: 'nama areaPenjualan'
    })
    .populate({
      path: 'directMaterials.material',
      select: 'name unit'
    })
    .populate({
      path: 'productItems.product',
      select: 'name typeProduk'
    })
    .populate({
      path: 'productItems.materialsRestored.material',
      select: 'name unit'
    });

    // Hitung ringkasan statistik
    let totalPengembalian = pengembalianList.length;
    let totalMaterialDikembalikan = 0;
    const materialStatistik = {};
    const produkStatistik = {};

    // Format data dan hitung statistik
    const formattedData = pengembalianList.map(pengembalian => {
      // Hitung material langsung
      const materialLangsung = pengembalian.directMaterials.map(item => {
        const materialId = item.material._id.toString();
        totalMaterialDikembalikan += item.quantity;
        
        if (!materialStatistik[materialId]) {
          materialStatistik[materialId] = {
            nama: item.material.name,
            satuan: item.material.unit,
            jumlah: 0
          };
        }
        materialStatistik[materialId].jumlah += item.quantity;
        
        return {
          namaMaterial: item.material.name,
          satuan: item.material.unit,
          jumlah: item.quantity
        };
      });
      
      // Hitung material melalui produk
      const productItems = pengembalian.productItems.map(item => {
        // Statistik produk
        const produkId = item.product._id.toString();
        if (!produkStatistik[produkId]) {
          produkStatistik[produkId] = {
            nama: item.product.name,
            jenis: item.product.typeProduk,
            jumlah: 0
          };
        }
        produkStatistik[produkId].jumlah += item.quantity;
        
        const bahanDikembalikan = item.materialsRestored.map(bahan => {
          const materialId = bahan.material._id.toString();
          totalMaterialDikembalikan += bahan.amountRestored;
          
          if (!materialStatistik[materialId]) {
            materialStatistik[materialId] = {
              nama: bahan.material.name,
              satuan: bahan.unit,
              jumlah: 0
            };
          }
          materialStatistik[materialId].jumlah += bahan.amountRestored;
          
          return {
            namaMaterial: bahan.material.name,
            satuan: bahan.unit,
            jumlah: bahan.amountRestored
          };
        });
        
        return {
          namaProduk: item.product.name,
          jenis: item.product.typeProduk,
          jumlahProduk: item.quantity,
          bahanDikembalikan
        };
      });
      
      return {
        _id: pengembalian._id,
        tanggal: pengembalian.createdAt,
        pengambilanId: pengembalian.pengambilanId,
        penjualanFinalId: pengembalian.penjualanFinalId,
        materialLangsung,
        productItems
      };
    });
    
    // Format statistik material
    const materialTerbanyak = Object.values(materialStatistik)
      .sort((a, b) => b.jumlah - a.jumlah)
      .slice(0, 5);
    
    // Format statistik produk
    const produkTerbanyak = Object.values(produkStatistik)
      .sort((a, b) => b.jumlah - a.jumlah)
      .slice(0, 5);
    
    res.status(200).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          nama: user.nama,
          areaPenjualan: user.areaPenjualan
        },
        rentangTanggal: {
          start: startDateObj,
          end: endDateObj
        },
        ringkasan: {
          totalPengembalian,
          totalMaterialDikembalikan,
          materialTerbanyak,
          produkTerbanyak
        },
        riwayat: formattedData
      }
    });
    
  } catch (error) {
    console.error("Error fetching pengembalian history:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
      error: error.message
    });
  }
};