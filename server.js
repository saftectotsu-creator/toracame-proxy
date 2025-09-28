// Node.jsとExpressを使ったHTTPプロキシサーバー
const express = require('express');
const cors = require('cors');
// ダイジェスト認証をサポートするために、@mhoc/axios-digest-authライブラリをインポート
const AxiosDigestAuth = require('@mhoc/axios-digest-auth').default; 

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
 * クライアントから送られたカメラのURL、ID、PASSを使用して画像を代理取得する。
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

    // 2. Digest認証インスタンスの生成
    const auth = new AxiosDigestAuth({
        username: authId,
        password: authPassword
    });

    try {
        // 3. ターゲットカメラへのリクエスト実行（Digest認証を適用）
        const response = await auth.request({
            method: 'get',
            url: targetUrl,
            responseType: 'arraybuffer', // 画像データとしてバッファで受け取る
            timeout: 10000 // 10秒でタイムアウト
        });

        // 4. レスポンスヘッダーの設定とデータ送信
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', response.data.length);

        // キャッシュ防止ヘッダー
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // 画像データをクライアントに送信
        res.send(response.data);

        console.log(`SUCCESS: Proxied request for ${authId} finished with status ${response.status} and size ${response.data.length} bytes.`);

    } catch (error) {
        // 5. エラーハンドリング
        // ターゲットカメラが返すステータスコード（401, 404など）をクライアントに返す
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
