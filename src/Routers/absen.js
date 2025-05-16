import express from "express";
import {absenMasuk, absenPulang, statusAbsen} from "../controller/absen.js";

const router = express.Router()


router.post("/pulang", absenPulang);
router.post("/masuk", absenMasuk);
router.post("/status", statusAbsen);

export default router