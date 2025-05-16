import mongoose from "mongoose";
const Schema = mongoose.Schema;

const productSchema = new Schema({
  name: { type: String, required: true, unique: true },
  recipe: [
    {
      material: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "bahanBaku",
        required: true,
      },
      amountPerUnit: { type: Number, required: true }, // dalam unit sesuai Material.unit :contentReference[oaicite:6]{index=6}
    },
  ],
  stock: { type: Number, default: 0 },
  sellingPrice: { type: Number, required: true }, // harga jual per cup/pcs
}, { timestamps: true });

const modelProduk = mongoose.model("Produk", productSchema);
export default modelProduk;
