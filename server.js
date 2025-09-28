// Node.jsとExpressを使ったHTTPプロキシサーバー
const express = require('express');
const axios = require('axios'); // Simple axiosを使用
const cors = require('require');

const app = express();
// Renderの環境変数PORTまたはデフォルトの3000を使用
const PORT = process.env.PORT || 3000;

// ----------------------------------------------------
// CORS設定: すべてのオリジンからのリクエストを許可
// ----------------------------------------------------
app.use(cors({
    origin: '*',
    methods: ['GET'],
}));

/**
 * 画像取得のためのプロキシエンドポイント
 */
app.get('/proxy', async (req, res) => {
    // 1. パラメータの取得とデコード
    const targetUrl = req.query.url;
    const authId = req.query.id;
    const authPassword = req.query.password;

    if (!targetUrl || !authId || !authPassword) {
        console.error('ERROR: Missing required query parameters (url, id, or password)');
        return res.status(400).send('Missing required query parameters.');
    }

    console.log(`INFO: Proxying request for URL: ${targetUrl} (ID: ${authId})`);

    try {
        // 2. ターゲットURLへのリクエスト実行（Basic認証を使用）
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'arraybuffer', // 画像データとしてバッファで受け取る
            auth: {
                username: authId,
                password: authPassword,
            },
            timeout: 10000 
        });

        // 3. レスポンスヘッダーの設定とデータ送信
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', response.data.length);

        // キャッシュ防止ヘッダー
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        res.send(response.data);

        console.log(`SUCCESS: Proxied request for ${authId} finished with status ${response.status} and size ${response.data.length} bytes.`);

    } catch (error) {
        // 4. エラーハンドリング
        const status = error.response ? error.response.status : error.code === 'ECONNABORTED' ? 408 : 500;
        const statusText = error.response ? error.response.statusText : error.code === 'ECONNABORTED' ? 'Request Timeout' : 'Internal Server Error';
        
        console.error(`ERROR: Proxy failed for ${authId}. Status: ${status} ${statusText}. Message: ${error.message}`);
        
        res.status(status).send({ 
            error: statusText,
            message: `Failed to fetch image from target URL. Status: ${status}`
        });
    }
});

// サーバーの起動
app.listen(PORT, () => {
    console.log(`Proxy server listening on port ${PORT}`);
});
