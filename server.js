const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { URL } = require('url');
// ⭐️ 新しいDigest認証モジュールをインポート
const DigestRequest = require('http-digest-request'); 
const httpAgent = new DigestRequest(); // エージェントを初期化

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// 認証試行関数 1: Basic認証 (ヘッダー)
async function attemptBasicAuth(url, id, password) {
    const authHeader = `Basic ${Buffer.from(`${id}:${password}`).toString('base64')}`;

    return axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
            'Authorization': authHeader,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36'
        },
        timeout: 15000 
    });
}

// 認証試行関数 2: Digest認証 (http-digest-requestを使用)
async function attemptDigestAuth(url, id, password) {
    return new Promise((resolve, reject) => {
        // http-digest-requestはコールバック形式のためPromiseでラップ
        httpAgent.request(
            url, 
            id, 
            password, 
            (error, response, body) => {
                if (error) {
                    // エラーオブジェクトにステータスがないため、手動で401をチェック
                    if (response && response.statusCode === 401) {
                         // 401の場合はrejectして、次の認証試行へ移行
                        return reject({ response: { status: 401 } });
                    }
                    return reject(error);
                }
                
                // 成功した場合は、Axiosの形式に合わせてレスポンスを整形してresolve
                if (response.statusCode === 200) {
                     resolve({
                        data: body, // Bufferデータ
                        headers: response.headers,
                        status: response.statusCode
                     });
                } else {
                     reject({ response: { status: response.statusCode, statusText: response.statusMessage } });
                }
            },
            // メソッド、ヘッダー、タイムアウト
            'GET', 
            { 'User-Agent': 'Mozilla/5.0' }, 
            15000 
        );
    });
}

// 認証試行関数 3: URL認証 (ID:PASS@ホスト名)
async function attemptUrlAuth(url, id, password) {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol;
    const host = urlObj.host;
    const pathAndQuery = urlObj.pathname + urlObj.search;
    
    const newUrl = `${protocol}//${id}:${password}@${host}${pathAndQuery}`;

    return axios.get(newUrl, {
        responseType: 'arraybuffer',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36'
        },
        timeout: 15000 
    });
}


app.get('/proxy', async (req, res) => {
    const { url, id, password } = req.query;

    if (!url || !id || !password) {
        return res.status(400).send('URL, ID, and password are required.');
    }

    try {
        let response;
        
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

        // 成功した場合の処理
        if (response) {
            res.set('Content-Type', response.headers['content-type']);
            // DigestRequestのbodyは既にBufferなのでそのまま送信
            return res.send(Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data));
        }

    } catch (error) {
        console.error('プロキシエラー:', error.message);
        
        if (error.response) {
            const status = error.response.status;
            console.error('最終ステータス:', status);
            res.status(status).send(`カメラサーバーエラー: ${status} ${error.response.statusText || 'Unknown' }。認証情報を確認してください。`);
        } else if (error.request) {
            res.status(504).send('Gateway Timeout: カメラからの応答なし');
        } else {
            res.status(500).send('内部サーバーエラー: ' + error.message);
        }
    }
});

app.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました。`);
});