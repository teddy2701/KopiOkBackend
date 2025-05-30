import mongoose from "mongoose";
const Schema = mongoose.Schema;


const skemaPenjualanTemp = new Schema({
    user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pengambilan:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'Pengambilan', required: true }],
    items: [{
      product:      { type: mongoose.Schema.Types.ObjectId, ref: 'Produk', required: true },
      quantity:     { type: Number, required: true }
    }],
    note:           { type: String },
    updatedAt:      { type: Date, default: Date.now }
  });
  

  const modelPenjualanTemp = mongoose.model("PenjualanTemp", skemaPenjualanTemp);
  export default modelPenjualanTemp;
  