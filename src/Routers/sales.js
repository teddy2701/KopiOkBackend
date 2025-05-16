import express from "express"
import { getSales, processReturns, processPickup, getSalesHistory, getSalesHistoryById} from "../controller/sales.js"
const router = express.Router() 

router.post("/kembali", processReturns)
router.post("/ambil", processPickup)
router.get("/history/", getSalesHistory)
router.get("/history/:id", getSalesHistoryById)
router.get("/", getSales)

export default router