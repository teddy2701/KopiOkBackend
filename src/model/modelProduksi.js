import mongoose from "mongoose";
const Schema = mongoose.Schema;

// InventoryBatch.js (Skema baru untuk tracking stok per batch)
const skemaProduksi = new Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Produk",
    required: true,
  },
  quantity: { type: Number, required: true },
  usedMaterials: [
    {
      material: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "bahanBaku",
        required: true,
      },
      totalUsed: { type: Number, required: true }, // jumlah bahan yang dipakai :contentReference[oaicite:8]{index=8}
    },
  ],
  totalRevenue: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

const modelProduksi = mongoose.model("Produksi", skemaProduksi);
export default modelProduksi;
