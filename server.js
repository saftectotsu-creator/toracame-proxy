const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

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
                'Authorization': authHeader
            },
            timeout: 10000 // タイムアウトを10秒に設定
        });

        // カメラから返されたContent-Typeヘッダーをそのままクライアントに返す
        res.set('Content-Type', response.headers['content-type']);
        res.send(Buffer.from(response.data));

    } catch (error) {
        console.error('プロキシエラー:', error.message);
        console.error('エラーレスポンス:', error.response?.status, error.response?.statusText);
        res.status(500).send('An error occurred on the proxy server.');
    }
});

app.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました。`);
});