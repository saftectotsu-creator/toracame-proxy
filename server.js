// server.js
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { createProxyMiddleware } from "http-proxy-middleware";
import DigestAuth from "@mhoc/axios-digest-auth";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ====== Proxy endpoint for camera images ======
app.get("/proxy", async (req, res) => {
  const { url, user, pass } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  console.log("------------------------------------------------");
  console.log(`▶ リクエスト: ${url}`);

  let buffer = null;

  try {
    // まず Basic 認証を試す
    console.log("認証試行 1: Basic認証 (ヘッダー)");
    const basicResp = await axios.get(url, {
      responseType: "arraybuffer",
      auth: {
        username: user,
        password: pass,
      },
      timeout: 8000,
    });

    if (basicResp.status === 200) {
      console.log("✅ Basic認証成功");
      buffer = Buffer.from(basicResp.data);
    }
  } catch (err) {
    console.log("Basic認証失敗 (401)。Digest認証を試行します。");
  }

  try {
    if (!buffer) {
      const digestAuth = new DigestAuth({ username: user, password: pass });
      const digestResp = await digestAuth.request({
        method: "GET",
        url,
        responseType: "arraybuffer",
        timeout: 8000,
      });

      if (digestResp.status === 200) {
        console.log("✅ Digest認証成功");
        buffer = Buffer.from(digestResp.data);
      }
    }
  } catch (err) {
    console.error("Digest認証失敗:", err.message);
  }

  // 画像が取得できなかった場合
  if (!buffer) {
    console.error("❌ 画像取得失敗");
    return res.status(500).json({ error: "Failed to fetch image" });
  }

  // ====== JPEGヘッダーを探してゴミを除去 ======
  const start = buffer.indexOf(Buffer.from([0xff, 0xd8]));
  if (start > 0) {
    console.warn(`⚠️ JPEGヘッダーの前に ${start} バイトのゴミを検出 → 削除`);
    buffer = buffer.slice(start);
  }

  // ====== レスポンス返却 ======
  res.set("Content-Type", "image/jpeg");
  res.set("Access-Control-Allow-Origin", "*");
  console.log("✅ クリーン済み画像をクライアントに送信します。");
  res.send(buffer);
});

// ====== 起動 ======
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
