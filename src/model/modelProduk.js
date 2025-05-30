import mongoose from "mongoose";
const Schema = mongoose.Schema;

const productSchema = new Schema({
  name: { type: String, required: true, unique: true },
  typeProduk: { type: String, required: true }, // coffe or nonCoffe
  stock: { type: Number, default: 0 }, // jumlah produk yang sudah di produksi
  dibuat: {type: Boolean, enum: [false, true], default: false}, // manual or otomatis
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
  sellingPrice: { type: Number, required: true }, // harga jual per cup/pcs
}, { timestamps: true });

const modelProduk = mongoose.model("Produk", productSchema);
export default modelProduk;
