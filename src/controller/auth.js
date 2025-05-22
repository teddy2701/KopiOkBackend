import modelUser from "../model/modelUser.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

export const login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await modelUser.findOne({ username }).select("+password");
    if (!user || user.length === 0 || user.password !== password) {
      return res.status(404).json({ message: "Username atau Passwword Salah" });
    }

    const payload = {
      id: user._id,
      username: user.username,
      nama: user.nama,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "20s",
      });
  
      const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
        expiresIn: "1D",
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        // secure: true,
        maxAge: 24 * 60 * 60 * 1000,
      });
      res.header('Access-Control-Allow-Origin', 'https://kopi-ok.vercel.app');
      res.header('Access-Control-Allow-Credentials', true);

      await modelUser.findByIdAndUpdate(user._id, {
        refreshToken,
      });
      
    //   req.session.userId = user._id;
        res.status(201).json({
        username: user.username,
        nama: user.nama,
        role: user.role,
        accessToken: accessToken,
      });


  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}


export const me = async (req, res, next) => {
    try {
      const userCherker = req.cookies.refreshToken;
      if (!userCherker)
        return res.status(401).json({ message: "Mohon login ke akun anda" });
  
      const user = await modelUser.findOne({ refreshToken: userCherker, });

      if (!user) return res.status(403).json({ message: "Token tidak valid" });
      jwt.verify(
        userCherker,
        process.env.REFRESH_TOKEN_SECRET,
        (err, decoded) => {
          if (err) return res.status(403).json({ message: "Token tidak valid" });
  
          const payload = {
            id: user._id,
            username: user.username,
            nama: user.nama,
            role: user.role,
          };
  
          const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
            expiresIn: "20s",
          });
          
          res.json({ accessToken  });
        }
      );
      res.header('Access-Control-Allow-Origin', 'https://kopi-ok.vercel.app');
res.header('Access-Control-Allow-Credentials', true);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Terjadi sesuatu pada server" });
      next(err);
    }
  };

  export const logout = async (req, res, next) => {
    try{
      const refreshToken = req.cookies.refreshToken;

    // Jika tidak ada token di cookies
    if (!refreshToken) {
      return res.sendStatus(204); // No Content
    }

    // Cari user dengan refresh token yang sesuai
    const user = await modelUser.findOne({ refreshToken });
    
    // Jika user tidak ditemukan, tetap clear cookie
    if (!user) {
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: true,
        sameSite: 'None'
      });
      return res.sendStatus(204);
    }

    // Hapus refresh token dari database
    await modelUser.findByIdAndUpdate(user._id, {
      refreshToken: null
    });

    // Clear cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      path: '/' // Pastikan path sama dengan saat set cookie
    });
res.header('Access-Control-Allow-Origin', 'https://kopi-ok.vercel.app');
res.header('Access-Control-Allow-Credentials', true);
    res.sendStatus(200);
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
  };
  