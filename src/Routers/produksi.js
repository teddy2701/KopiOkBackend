import express from "express";
import { createBahanBaku, getAvailableProducts ,addMaterialStock, getMaterials, getProducts,createProduct, createProduction, getProductions } from "../controller/produsksi.js";

const router = express.Router()


router.post("/buat", createBahanBaku);
router.post("/produk/buat", createProduct);
router.post("/buatProduksi", createProduction);
router.get("/", getMaterials);
router.get("/produk", getProducts);
router.get("/getData", getProductions);
router.get("/produk/tersedia", getAvailableProducts);
router.put("/:id/tambahStock", addMaterialStock);

export default router