import express from "express";
import { createBahanBaku ,addMaterialStock, getPengambilanData, getMaterials, getProducts,createProduct, createProduction, getProductions, getProductsForCashier } from "../controller/produsksi.js";

const router = express.Router()


router.post("/buat", createBahanBaku);
router.post("/produk/buat", createProduct);
router.post("/buatProduksi", createProduction);
router.get("/", getMaterials);
router.get("/produk", getProducts);
router.get("/getData", getProductions);
router.get("/forCashier", getProductsForCashier);
router.get("/pengambilan", getPengambilanData);

// router.get("/produk/tersedia", getAvailableProducts);
router.put("/:id/tambahStock", addMaterialStock);

export default router