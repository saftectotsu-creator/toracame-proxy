const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { URL } = require('url');

// 🚨 最終決定: CommonJS 環境で ES モジュールとして公開されたライブラリには .default が必要
// これまでのログから、new で呼び出すのが正しい形式であるため、インポートも修正
const AxiosDigestAuth = require('@mhoc/axios-digest-auth').default; 

const app = express();
const port = process.env.PORT || 10000;

// CORSを有効化 (すべてのオリジンを許可)
app.use(cors());
app.use(express.json());

// ====================================================================
// ネットワーク疎通テスト用エンドポイント
// ====================================================================
app.get('/test-connection', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).send('URLパラメータが必要です。例: ?url=http://example.com:8080');
    }

    try {
        console.log(`ネットワーク疎通テスト: ${url}`);

        const response = await axios.get(url, {
            timeout: 10000,
            maxRedirects: 0,
            // 認証要求を示す401や403も成功として扱う
            validateStatus: (status) =>
                (status >= 200 && status < 400) || status === 401 || status === 403
        });

        if (response.status === 200) {
            return res.send(`✅ 接続成功 (200 OK) 匿名アクセス可能`);
        } else if (response.status === 401 || response.status === 403) {
            return res.send(`⚠️ 接続成功 (ステータス: ${response.status}) - 認証要求あり。ネットワーク疎通は問題なし。`);
        }
    } catch (error) {
        if (['ECONNREFUSED', 'EHOSTUNREACH', 'ETIMEDOUT'].includes(error.code)) {
            return res.status(503).send(`❌ 接続失敗: ${error.code}。ルーター/ファイアウォールを確認してください。`);
        }
        if (error.response) {
            return res.send(`⚠️ 接続確立 (ステータス: ${error.response.status} ${error.response.statusText})`);
        }
        return res.status(500).send(`🚨 予期せぬエラー: ${error.message}`);
    }
});

// ====================================================================
// 認証試行関数群
// ====================================================================

// 1. Basic認証 (ヘッダー)
async function attemptBasicAuth(url, id, password) {
    const authHeader = `Basic ${Buffer.from(`${id}:${password}`).toString('base64')}`;
    return axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
            'Authorization': authHeader,
            'User-Agent': 'Mozilla/5.0'
        },
        timeout: 15000
    });
}

// 2. Digest認証
async function attemptDigestAuth(url, id, password) {
    // 最終決定版: newでインスタンス化し、インスタンスの .request() メソッドを使用
    const digestAuth = new AxiosDigestAuth({
        username: id,
        password: password
    });

    // digestAuth.request を使用すると、内部で認証プロセスが自動で完了する
    return digestAuth.request({
        method: 'GET',
        url: url,
        responseType: 'arraybuffer',
        headers: { 
            'User-Agent': 'Mozilla/5.0',
            // 💡 502 Bad Gateway 対策: 接続ヘッダーを close にしてカメラサーバーとの接続を明示的に終了させる
            'Connection': 'close' 
        },
        timeout: 15000,
        validateStatus: (status) => status >= 200 && status < 500
    });
}

// 3. URL埋め込み認証 (id:pass@host)
async function attemptUrlAuth(url, id, password) {
    const urlObj = new URL(url);
    const newUrl = `${urlObj.protocol}//${encodeURIComponent(id)}:${encodeURIComponent(password)}@${urlObj.host}${urlObj.pathname}${urlObj.search}`;
    return axios.get(newUrl, {
        responseType: 'arraybuffer',
        headers: { 
            'User-Agent': 'Mozilla/5.0',
            // 💡 502 Bad Gateway 対策
            'Connection': 'close' 
        },
        timeout: 15000
    });
}

// ====================================================================
// プロキシエンドポイント
// ====================================================================
app.get('/proxy', async (req, res) => {
    const { url, id, password } = req.query;

    if (!url) {
        return res.status(400).send('URL is required.');
    }

    try {
        let response;

        // 認証なしアクセス
        if (!id || !password) {
            console.log('匿名アクセスを試行');
            response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000
            });
        } else {
            // Basic → Digest → URL認証の順で試行
            try {
                console.log('認証試行 1: Basic認証');
                response = await attemptBasicAuth(url, id, password);
            } catch (error) {
                if (error.response && error.response.status === 401) {
                    console.log('Basic失敗 → Digest認証へ');
                    try {
                        response = await attemptDigestAuth(url, id, password);
                    } catch (err2) {
                        if (err2.response && err2.response.status === 401) {
                            console.log('Digest失敗 → URL認証へ');
                            response = await attemptUrlAuth(url, id, password);
                        } else {
                            // ネットワークエラー (タイムアウトや接続切断) もここでキャッチされる
                            throw err2;
                        }
                    }
                } else {
                    throw error;
                }
            }
        }

        if (response) {
            res.set('Content-Type', response.headers['content-type'] || 'image/jpeg');
            // 'Access-Control-Allow-Origin' ヘッダーを明示的にセット
            res.set('Access-Control-Allow-Origin', '*'); 
            return res.send(Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data));
        }
    } catch (error) {
        console.error('プロキシエラー:', error.message);
        
        // 502 Bad Gateway は、このエラーハンドリングで500として処理されることが多い
        const status = error.response ? error.response.status : 500;
        const statusText = error.response ? error.response.statusText : 'Internal Server Error';
        
        // サーバークラッシュ防止のため、CORSヘッダーをここでもセット
        res.set('Access-Control-Allow-Origin', '*');
        res.status(status).send(`カメラサーバーエラー: ${status} ${statusText}。詳細: ${error.message}`);
    }
});

// ====================================================================
// サーバー起動
// ====================================================================
app.listen(port, () => {
    console.log(`サーバー起動: ポート ${port}`);
});
