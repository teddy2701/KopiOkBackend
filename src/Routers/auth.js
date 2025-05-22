import express from "express";
import {login, me, logout} from "../controller/auth.js";

const router = express.Router()


router.post("/login", login);
router.get("/me", me);
router.get("/logout", logout);

export default router