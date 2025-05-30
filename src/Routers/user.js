import express from "express"
import { createUser, getUser, getUserById, updateUser, deleteUser, userArea } from "../controller/user.js"
import uploadImage from "../middleware/uploadImage.js"

const router = express.Router() 

router.post("/createUser",uploadImage, createUser)
router.get("/getUser", getUser)
router.get("/getUser/:id", getUserById) 
router.put("/updateUser/:id", updateUser)
router.delete("/deleteUser/:id", deleteUser)
router.get("/userArea", userArea) // Optional: Get all users

export default router