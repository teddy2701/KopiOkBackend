import mongoose from "mongoose";

const Schema = mongoose.Schema;
const skemaPengembalian = new Schema({
    user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pengambilanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pengambilan',  },
    penjualanFinalId: { type: mongoose.Schema.Types.ObjectId, ref: 'PenjualanFinal', required: true },
    directMaterials:[{
      material:    { type: mongoose.Schema.Types.ObjectId, ref: 'bahanBaku', required: true },
      quantity:    { type: Number, required: true }
    }],
    productItems:  [{
      product:     { type: mongoose.Schema.Types.ObjectId, ref: 'Produk', required: true },
      quantity:    { type: Number, required: true },
      materialsRestored:[{
        material:   { type: mongoose.Schema.Types.ObjectId, ref: 'bahanBaku', required: true },
        amountRestored:{ type: Number, required: true },
        unit:       { type: String, required: true }
      }]
    }],
    createdAt:      { type: Date, default: Date.now }
  });

  const modelPengembalian = mongoose.model(
    "Pengembalian",
    skemaPengembalian
  );
  
  export default modelPengembalian;
  