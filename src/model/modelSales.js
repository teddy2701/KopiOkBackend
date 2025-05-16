import mongoose from "mongoose";
const Schema = mongoose.Schema;

const skemaPenjualan = new Schema({
    product:    { type: mongoose.Schema.Types.ObjectId, ref: 'Produk', required: true },
    quantity:   { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },  // new
    createdAt:  { type: Date, default: Date.now }
  });
  
  const modelSales = mongoose.model("Sales", skemaPenjualan);
  export default modelSales;
  