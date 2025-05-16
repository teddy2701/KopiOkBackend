import express from "express";
import {login, me, logout} from "../controller/auth.js";

const router = express.Router()


router.post("/login", login);
router.get("/me", me);
router.post("/logout", logout);

export default router