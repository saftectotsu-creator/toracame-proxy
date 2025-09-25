const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());

app.get('/proxy', async (req, res) => {
    try {
        const { url, id, password } = req.query;

        if (!url || !id || !password) {
            return res.status(400).send('URL, ID, and password are required.');
        }

        const authHeader = `Basic ${Buffer.from(`${id}:${password}`).toString('base64')}`;

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'Authorization': authHeader,
                // 一部のカメラはブラウザからのリクエストを期待するため、User-Agentを追加
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36'
            },
            timeout: 15000 // タイムアウトを15秒に延長
        });

        // カメラから返されたContent-Typeヘッダーをそのままクライアントに返す
        res.set('Content-Type', response.headers['content-type']);
        res.send(Buffer.from(response.data));

    } catch (error) {
        console.error('プロキシエラー:', error.message);
        if (error.response) {
            // サーバーがエラーレスポンスを返した場合
            console.error('ステータス:', error.response.status);
            console.error('レスポンスデータ:', error.response.data.toString());
            res.status(error.response.status).send('カメラサーバーエラー: ' + error.response.statusText);
        } else if (error.request) {
            // リクエストが送信されたが、応答がなかった場合（タイムアウトなど）
            console.error('リクエストが応答しませんでした。');
            res.status(504).send('Gateway Timeout');
        } else {
            // その他のエラー
            console.error('リクエスト設定エラー:', error.message);
            res.status(500).send('内部サーバーエラー');
        }
    }
});

app.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました。`);
});