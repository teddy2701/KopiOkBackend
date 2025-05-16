import mongoose from "mongoose";
const Schema = mongoose.Schema;

const skemaProdukHistory = new Schema({
    product:    { type: mongoose.Schema.Types.ObjectId, ref: 'Produk', required: true },
    changeType: { type: String, enum: ['IN','OUT'], required: true },
    amount:     { type: Number, required: true },
    user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },  // new
    date:       { type: Date, default: Date.now },
    note:       { type: String }
  });

  const modelProdukHistory = mongoose.model("ProdukHistory", skemaProdukHistory);
  export default modelProdukHistory;