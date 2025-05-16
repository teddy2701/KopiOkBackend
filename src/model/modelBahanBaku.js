import mongoose from "mongoose";
const Schema = mongoose.Schema;

const skemaBahanBaku = new Schema({
  name: { type: String, required: true, unique: true },
  unit: { type: String, enum: ["kg", "gram", "liter", "pcs"], required: true },
  stock: { type: Number, required: true, default: 0 },
  price: { type: Number, required: true }, // total harga saat input stok :contentReference[oaicite:4]{index=4}
});

const modelBahanBaku = mongoose.model("bahanBaku", skemaBahanBaku);
export default modelBahanBaku;
