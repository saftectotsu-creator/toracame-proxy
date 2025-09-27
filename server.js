const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { URL } = require('url');
// 確実に存在するDigest認証モジュールを使用
const fetch = require('node-fetch');
const DigestFetch = require('digest-fetch'); 

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());


// ====================================================================
// 🚨 ネットワーク疎通テスト用エンドポイント
// ====================================================================
app.get('/test-connection', async (req, res) => {
    const { url } = req.query; 

    if (!url) {
        return res.status(400).send('URLパラメータが必要です。例: ?url=http://szfb263.glddns.com:8080');
    }

    try {
        console.log(`ネットワーク疎通テストを開始: ${url}`);
        
        // 認証情報を渡さずに、純粋にカメラのベースURLへアクセスを試みる
        const response = await axios.get(url, {
            timeout: 10000, 
            maxRedirects: 0, 
            validateStatus: (status) => status >= 200 && status < 400 || status === 401 || status === 403 
        });

        // 成功と見なせる応答ステータス（ネットワークは到達可能）
        if (response.status === 200) {
             return res.send(`✅ 接続成功 (ステータス: 200 OK)。カメラは匿名アクセスを許可しています。`);
        } else if (response.status === 401 || response.status === 403) {
             return res.send(`⚠️ 接続成功 (ステータス: ${response.status} - 認証またはアクセス拒否)。ネットワーク疎通は**問題ありません**。`);
        }

    } catch (error) {
        // ネットワークレベルのエラーをキャッチ
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

// 認証試行関数 2: Digest認証 (digest-fetchを使用)
async function attemptDigestAuth(url, id, password) {
    // Digest認証に使用するIDとパスワードをエンコード
    const encodedId = encodeURIComponent(id);
    const encodedPassword = encodeURIComponent(password);
    
    // エンコードされた情報でクライアントを初期化
    const digestClient = new DigestFetch(encodedId, encodedPassword, { 
        fetch: fetch 
    });

    try {
        const response = await digestClient.fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                // Axis互換性のためConnection: closeを追加
                'Connection': 'close' 
            },
            timeout: 15000 
        });

        // 認証失敗時 (401) の処理
        if (response.status === 401) {
            throw { response: { status: 401, statusText: response.statusText || 'Unauthorized' } };
        }

        // 成功時 (200) の処理
        if (response.ok) {
            const buffer = await response.arrayBuffer();
            return {
                data: Buffer.from(buffer), // Bufferデータ
                headers: response.headers,
                status: response.status
            };
        }
        
        // 認証失敗以外のエラー (404, 500など) の処理
        throw { 
            response: { 
                status: response.status, 
                statusText: response.statusText || 'Internal Error'
            } 
        };

    } catch (error) {
        // タイムアウトやネットワークエラー、予期せぬエラーの場合、次の認証へ移行するため401として処理
        if (!error.response && (error.name === 'AbortError' || !error.response)) {
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
    
    // IDとパスワードを強制的にURIエンコードする
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
        return res.status(400).send('URL is required.'); // URLのみ必須に変更
    }

    try {
        let response;
        
        // 認証情報が提供されていない場合は、匿名で直接アクセスを試みる (匿名アクセス対応)
        if (!id || !password) {
            console.log('認証情報なし。匿名アクセスを試行します。');
            response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 15000
            });
            // 匿名アクセスが成功すれば続行。失敗した場合はcatchブロックへ
        
        } else {
            // 認証情報が提供されている場合は、Basic -> Digest -> URLの順で試行 (通常の認証プロセス)
            
            // 1. Basic認証 (ヘッダー) 試行
            try {
                console.log('認証試行 1: Basic認証 (ヘッダー)');
                response = await attemptBasicAuth(url, id, password);
            } catch (error) {
                // 2. Digest認証 試行
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
            // Content-Typeを適切に設定し、画像データを返す
            res.set('Content-Type', response.headers['content-type'] || 'image/jpeg');
            return res.send(Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data));
        }

    } catch (error) {
        console.error('プロキシエラー:', error.message);
        
        const status = error.response ? error.response.status : 500;
        const statusText = error.response ? error.response.statusText : 'Internal Server Error';
        
        // 最終的なエラー応答
        res.status(status).send(`カメラサーバーエラー: ${status} ${statusText}。認証情報またはカメラURLを確認してください。`);
    }
});

app.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました。`);
});