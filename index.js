import express from 'express'
import dotenv from "dotenv";
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import cors from "cors";
import cookieParser from 'cookie-parser';

import UsersRouter from './src/Routers/user.js'
import AuthRouter from './src/Routers/auth.js'
import AbsenRouter from './src/Routers/absen.js'
import ProduksiRouter from './src/Routers/produksi.js'
import SalesRouter from './src/Routers/sales.js'
import path from 'path';

dotenv.config();
const app = express()
const port = 4454
const whitelist = ["http://localhost:4173", "http://localhost:5173", "https://kopi-ok.vercel.app"];

app.use(cookieParser())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(
  cors({
    origin: function (origin, callback) {
      if (whitelist.indexOf(origin) !== -1 || !origin) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["set-cookie"]
  })
);

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use("/user", UsersRouter)
app.use("/auth", AuthRouter)
app.use("/absen", AbsenRouter)
app.use("/produksi", ProduksiRouter)
app.use("/sale", SalesRouter)

app.use((error, req, res, next) => {
  const status = error.errorStatus || 500;
  const message = error.message;
  const data = error.data;
  res.status(400).json({
    message: message,
    data: data,
  });
});

mongoose
  .connect(process.env.DB)
  .then(() => {
    app.listen(port, () => console.log("Server listening on port: ", port));
  })
  .catch((err) => console.log(err));
