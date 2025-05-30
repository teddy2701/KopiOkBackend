import express from "express"
import { getSales,getTotalPendapatan ,getPengambilanID, getSalesReport,getLaporanHarian, createReturn, createPengambilan, getFinalSale ,createPenjualanTemp, getSalesHistory, getSalesHistoryById, savePenjualanTemp,  getPenjualanTemp, finalizePenjualan} from "../controller/sales.js"
const router = express.Router() 

router.post("/kembali", createReturn)
router.post("/ambil", createPengambilan)
router.post("/simpan/temp", createPenjualanTemp )
router.post("/simpan/final/", finalizePenjualan)
router.get("/get/pengambilan/:id", getPengambilanID)
router.get("/get/laporan/:id", getLaporanHarian)

router.get("/laporan-pendapatan/:id", getSalesReport);
router.get('/laporan-pendapatan', getTotalPendapatan);
router.get("/history/", getSalesHistory)
router.get("/history/:id", getSalesHistoryById)
router.get("/", getSales)
router.get("/temp/:id", getPenjualanTemp)
router.put("/temp/edit/:id", savePenjualanTemp)

router.get("/get/final/:id", getFinalSale)

export default router