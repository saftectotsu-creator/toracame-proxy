const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// CORSを有効にする（すべてのオリジンからのアクセスを許可）
app.use(cors());

// URLエンコードされたデータをパースするミドルウェア
app.use(express.urlencoded({ extended: true }));

// プロキシエンドポイント
app.get('/proxy', async (req, res) => {
    const { url, id, password } = req.query;

    if (!url) {
        return res.status(400).send('URLが指定されていません。');
    }

    try {
        const finalUrl = `http://${id}:${password}@${url.split('//')[1]}`;
        
        // カメラにリクエストを送信
        const response = await axios.get(finalUrl, {
            responseType: 'arraybuffer' // 画像データをバイナリとして受け取る
        });

        // カメラから受け取った画像データをクライアントに送信
        res.set('Content-Type', response.headers['content-type']);
        res.send(Buffer.from(response.data));

    } catch (error) {
        console.error('プロキシエラー:', error.message);
        res.status(500).send('画像の取得に失敗しました。');
    }
});

app.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました。`);
});