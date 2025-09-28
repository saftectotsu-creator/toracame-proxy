import express from "express";
import cors from "cors";
import AxiosDigestAuth from "@mhoc/axios-digest-auth";  // ← 正しいimport
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get("/proxy", async (req, res) => {
  try {
    const { url, id, password } = req.query;

    if (!url || !id || !password) {
      return res.status(400).send("Missing parameters");
    }

    // Digest認証クライアント生成
    const digestAuth = new AxiosDigestAuth({
      username: id,
      password: password,
    });

    // まず Digest 認証リクエスト
    const response = await digestAuth.request({
      method: "GET",
      url: url,
      responseType: "arraybuffer",
    });

    res.set("Content-Type", "image/jpeg");
    res.send(response.data);

  } catch (err) {
    console.error("Proxy error:", err.message);

    if (err.response) {
      console.error("Camera response:", err.response.status, err.response.statusText);
      res.status(err.response.status).send("Camera error: " + err.response.statusText);
    } else {
      res.status(500).send("サーバーエラー: " + err.message);
    }
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
