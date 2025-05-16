import mongoose from "mongoose";
const Schema = mongoose.Schema;

const skemaAbsen = new Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['IN', 'OUT'], required: true },
    timestamp: { type: Date, default: Date.now }
  });

  skemaAbsen.index({ userId: 1, type: 1, timestamp: 1 });
  const modelAbsen = mongoose.model("Absen", skemaAbsen);
  export default modelAbsen;