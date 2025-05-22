import mongoose from "mongoose";
const Schema = mongoose.Schema;

const skemaUser = new Schema({
  username: {
    // Gunakan lowercase untuk field names
    type: String,
    required: [true, "Username is required"],
    unique: true,
    trim: true,
  },

  password: {
    type: String,
    required: [true, "Password is required"],
    select: false, // Jangan pernah kembalikan password dalam query
  },

  nama: {
    type: String,
    required: [true, "Name is required"],
    trim: true,
    maxlength: [100, "Name cannot exceed 100 characters"],
  },

  noTelp: {
    type: String,
    trim: true,
    validate: {
      validator: function (v) {
        return /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/.test(v);
      },
      message: (props) => `${props.value} is not a valid phone number!`,
    },
  },

  fotoWajah: {
    url: String,
    filename: String,
    originalName: String,
    mimeType: String,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },

  fotoKTP: {
    url: String,
    filename: String,
    originalName: String,
    mimeType: String,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },

  role: {
    type: String,
    enum: ["admin", "user", "produksi"],
    default: "user",
  },

  refreshToken: {
    type: String,
    select: false,
  },
  
},
 {
  timestamps: true,
});
const modelUser = mongoose.model("User", skemaUser);
export default modelUser;
