import mongoose from "mongoose";

const Schema = mongoose.Schema;

const skemaLaporan = new Schema({
    user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date:           { type: Date, required: true },
    pengambilan:    { type: mongoose.Schema.Types.ObjectId, ref: 'Pengambilan' },
    penjualanFinal: { type: mongoose.Schema.Types.ObjectId, ref: 'PenjualanFinal' },
    pengembalian:   { type: mongoose.Schema.Types.ObjectId, ref: 'Pengembalian' },
    deltaMaterials:[{
      material:    { type: mongoose.Schema.Types.ObjectId, ref: 'bahanBaku', required: true },
      netChange:   { type: Number, required: true }, // pengambilan – pengembalian
      unit:        { type: String, required: true }
    }],
    createdAt:      { type: Date, default: Date.now }
  });
  

  const modelLaporan = mongoose.model(
    "Laporan",
    skemaLaporan
  );
  
  export default modelLaporan;