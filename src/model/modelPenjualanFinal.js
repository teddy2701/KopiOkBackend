import mongoose from "mongoose";
const Schema = mongoose.Schema;

const skemaPenjualanFinal = new Schema({
    user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pengambilanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pengambilan', required: true },
    items:         [{
      product:      { type: mongoose.Schema.Types.ObjectId, ref: 'Produk', required: true },
      quantity:     { type: Number, required: true },
      price:        { type: Number, required: true }
    }],
    total:          { type: Number, required: true },
    pengeluaran:          { type: Number, required: true },
    notePengeluaran:      { type: String, required: true },
    completedAt:    { type: Date, default: Date.now }
  });
  

  const modelPenjualanFinal = mongoose.model("PenjualanFinal", skemaPenjualanFinal);
  export default modelPenjualanFinal;