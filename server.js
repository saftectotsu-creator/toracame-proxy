const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { URL } = require('url');
const DigestAuth = require('axios-digest-auth'); // Digest認証用モジュール

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

// 認証試行関数 2: Digest認証
async function attemptDigestAuth(url, id, password) {
    const digestAuth = new DigestAuth(id, password);
    const authenticatedAxios = digestAuth.axios;

    return authenticatedAxios.get(url, {
        responseType: 'arraybuffer',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36'
        },
        timeout: 15000 
    });
}

// 認証試行関数 3: URL認証 (ID:PASS@ホスト名)
async function attemptUrlAuth(url, id, password) {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol;
    const host = urlObj.host;
    const pathAndQuery = urlObj.pathname + urlObj.search;
    
    // 認証情報をホスト名に組み込んだ新しいURLを作成
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
                         throw error; // Digest認証で別のエラーが出た場合はスロー
                    }
                }
            } else {
                throw error; // Basic認証で別のエラーが出た場合はスロー
            }
        }

        // 成功した場合の処理
        if (response) {
            res.set('Content-Type', response.headers['content-type']);
            return res.send(Buffer.from(response.data));
        }

    } catch (error) {
        console.error('プロキシエラー:', error.message);
        
        if (error.response) {
            const status = error.response.status;
            console.error('最終ステータス:', status);
            // 最終的に401なら、認証情報をクライアントに返す
            res.status(status).send(`カメラサーバーエラー: ${status} ${error.response.statusText}。認証情報を確認してください。`);
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