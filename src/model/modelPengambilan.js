import mongoose from "mongoose";

const Schema = mongoose.Schema;

const skemaPengambilan = new Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now },
  note: { type: String },
  uangPecah: { type: Number, default: 0 },
  // Untuk pengambilan material langsung
  directMaterials: [{
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'bahanBaku', required: true },
    quantity: { type: Number, required: true }
  }],
  productItems: [{
    product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Produk', required: true },
    quantity: { type: Number, required: true },
    materialsUsed: [{
      material:   { type: mongoose.Schema.Types.ObjectId, ref: 'bahanBaku', required: true },
      amountUsed: { type: Number, required: true },
      unit:       { type: String, required: true }
    }]
  }],
  
  
  status: { type: String, enum: ['active', 'completed'], default: 'active' }
});

const modelPengambilan = mongoose.model(
  "Pengambilan",
  skemaPengambilan
);

export default modelPengambilan;



