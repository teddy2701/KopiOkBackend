import modelUser from "../model/modelUser.js";
import jwt from "jsonwebtoken";

export const verifyUser = async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
   
    if (!token)
      return res.status(401).json({ pesan: "Mohon login ke akun anda" });
  
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) return res.status(403).json({ pesan: "Token tidak valid" });
      console.log(decoded);
      req.user = decoded.username;
  
      next();
    });
  };
  
  export const adminOnly = async (req, res, next) => {
    const user = await modelUser.findOne({
      _id: req.session.userId,
    });
  
    if (!user) return res.status(404).json({ pesan: "User tidak ada" });
    if (user.role !== "admin")
      return res.status(403).json({ pesan: "Akses ditolak" });
  
    next();
  };
  