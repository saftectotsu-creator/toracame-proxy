const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { URL } = require('url');

// 💡 Digest認証ライブラリは残しますが、使用順序を下げます
const AxiosDigestAuth = require('@mhoc/axios-digest-auth').default; 

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ====================================================================
// ネットワーク疎通テスト用エンドポイント (省略)
// ====================================================================
app.get('/test-connection', async (req, res) => {
    // ... (テストコードは省略)
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
    const digestAuth = new AxiosDigestAuth({
        username: id,
        password: password
    });

    return digestAuth.request({
        method: 'GET',
        url: url,
        responseType: 'arraybuffer',
        headers: { 
            'User-Agent': 'Mozilla/5.0',
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
            // 💡 認証順序変更: Basic → URL認証 (テスト成功済み) → Digest認証 (バグ回避)
            try {
                console.log('認証試行 1: Basic認証');
                response = await attemptBasicAuth(url, id, password);
            } catch (error) {
                if (error.response && error.response.status === 401) {
                    
                    // --- 優先度 2: URL埋め込み認証 (テストで成功したため優先) ---
                    console.log('Basic失敗 → URL認証へ (強制フォールバック)');
                    try {
                        response = await attemptUrlAuth(url, id, password);
                    } catch (err2) {
                        if (err2.response && err2.response.status === 401) {
                            
                            // --- 優先度 3: Digest認証 (最終手段として残す) ---
                            console.log('URL認証失敗 → Digest認証へ');
                            response = await attemptDigestAuth(url, id, password);
                        } else {
                            // URL認証中のネットワークエラー
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
            res.set('Access-Control-Allow-Origin', '*'); 
            // 💡 認証成功ログを出力
            console.log('✅ 認証成功。画像データをクライアントに送信します。');
            return res.send(Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data));
        }
    } catch (error) {
        console.error('プロキシエラー:', error.message);
        
        const status = error.response ? error.response.status : 500;
        const statusText = error.response ? error.response.statusText : 'Internal Server Error';
        
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
