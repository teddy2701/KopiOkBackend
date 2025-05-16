import mongoose from "mongoose";
const Schema = mongoose.Schema;

const skemaBahanBakuHistory = new Schema({
  material: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Material",
    required: true,
  },
  changeType: { type: String, enum: ["IN", "OUT"], required: true },
  amount: { type: Number, required: true },
  price: { type: Number }, // price for IN transactions
  date: { type: Date, default: Date.now },
  note: { type: String },
});

const modelBahanBakuHistory = mongoose.model(
  "bahanBakuHistory",
  skemaBahanBakuHistory
);
export default modelBahanBakuHistory;
