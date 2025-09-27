const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { URL } = require('url');
const fetch = require('node-fetch'); 
// 最終Digest認証ライブラリ
const AxiosDigest = require('axios-digest').default; // 存在確認済み

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());


// ====================================================================
// 🚨 ネットワーク疎通テスト用エンドポイント (変更なし)
// ====================================================================
app.get('/test-connection', async (req, res) => {
    const { url } = req.query; 

    if (!url) {
        return res.status(400).send('URLパラメータが必要です。例: ?url=http://szfb263.glddns.com:8080');
    }

    try {
        console.log(`ネットワーク疎通テストを開始: ${url}`);
        
        const response = await axios.get(url, {
            timeout: 10000, 
            maxRedirects: 0, 
            validateStatus: (status) => status >= 200 && status < 400 || status === 401 || status === 403 
        });

        if (response.status === 200) {
             return res.send(`✅ 接続成功 (ステータス: 200 OK)。カメラは匿名アクセスを許可しています。`);
        } else if (response.status === 401 || response.status === 403) {
             return res.send(`⚠️ 接続成功 (ステータス: ${response.status} - 認証またはアクセス拒否)。ネットワーク疎通は**問題ありません**。`);
        }

    } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'EHOSTUNREACH' || error.code === 'ETIMEDOUT') {
            return res.status(503).send(`❌ 接続失敗: ${error.code}。カメラのポートはRenderから到達できません。**ルーター/ファイアウォール**を確認してください。`);
        }
        if (error.response) {
             return res.send(`⚠️ 接続は確立 (ステータス: ${error.response.status} ${error.response.statusText})。ネットワーク的には問題ありません。`);
        }
        return res.status(500).send(`🚨 予期せぬエラー: ${error.message}`);
    }
});
// ====================================================================


// 認証試行関数 1: Basic認証 (ヘッダー)
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

// 認証試行関数 2: Digest認証 (axios-digestを使用)
async function attemptDigestAuth(url, id, password) {
    // axios-digestクライアントを初期化
    const digestAuth = new AxiosDigest({
        username: id,
        password: password
    });

    try {
        // AxiosDigestでGETリクエストを実行 (ライブラリの仕様に合わせてPOSTメソッドを使用する可能性があります)
        const response = await digestAuth.post(url, {}, { 
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Connection': 'close' 
            },
            timeout: 15000,
            validateStatus: (status) => status >= 200 && status < 500
        });

        // 認証失敗時 (401) の処理
        if (response.status === 401) {
            throw { response: { status: 401, statusText: 'Unauthorized' } };
        }

        // 成功時 (200) の処理
        return response; 

    } catch (error) {
        if (!error.response && error.code === 'ECONNABORTED') {
            throw { response: { status: 401, statusText: 'Timeout/Network Error' } };
        }
        throw error;
    }
}

// 認証試行関数 3: URL認証 (ID:PASS@ホスト名)
async function attemptUrlAuth(url, id, password) {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol;
    const host = urlObj.host;
    const pathAndQuery = urlObj.pathname + urlObj.search;
    
    const encodedId = encodeURIComponent(id);
    const encodedPassword = encodeURIComponent(password);

    const newUrl = `${protocol}//${encodedId}:${encodedPassword}@${host}${pathAndQuery}`;

    return axios.get(newUrl, {
        responseType: 'arraybuffer',
        headers: {
            'User-Agent': 'Mozilla/5.0'
        },
        timeout: 15000 
    });
}


app.get('/proxy', async (req, res) => {
    const { url, id, password } = req.query;

    if (!url) {
        return res.status(400).send('URL is required.'); 
    }

    try {
        let response;
        
        // 認証情報が提供されていない場合は、匿名で直接アクセスを試みる
        if (!id || !password) {
            console.log('認証情報なし。匿名アクセスを試行します。');
            response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 15000
            });
        
        } else {
            // 認証情報が提供されている場合は、Basic -> Digest -> URLの順で試行
            
            // 1. Basic認証 (ヘッダー) 試行
            try {
                console.log('認証試行 1: Basic認証 (ヘッダー)');
                response = await attemptBasicAuth(url, id, password);
            } catch (error) {
                // 2. Digest認証 試行 (Pythonで成功したロジックの代替)
                if (error.response && error.response.status === 401) {
                    console.log('Basic認証失敗 (401)。Digest認証を試行します。');
                    try {
                        response = await attemptDigestAuth(url, id, password);
                    } catch (error) {
                        // 3. URL認証 試行
                        if (error.response && error.response.status === 401) {
                            console.log('Digest認証失敗 (401)。URL認証を試行します。');
                            response = await attemptUrlAuth(url, id, password);
                        } else {
                             throw error;
                        }
                    }
                } else {
                    throw error;
                }
            }
        }

        // 成功した場合の処理 (匿名/認証のどちらでも)
        if (response) {
            res.set('Content-Type', response.headers['content-type'] || 'image/jpeg');
            return res.send(Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data));
        }

    } catch (error) {
        console.error('プロキシエラー:', error.message);
        
        const status = error.response ? error.response.status : 500;
        const statusText = error.response ? error.response.statusText : 'Internal Server Error';
        
        res.status(status).send(`カメラサーバーエラー: ${status} ${statusText}。認証情報またはカメラURLを確認してください。`);
    }
});

app.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました。`);
});