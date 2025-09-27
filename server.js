const express = require('express');
const axios = require('axios');
const cors = require('cors');
<<<<<<< Updated upstream
=======
const { URL } = require('url');
const DigestAuth = require('axios-digest-auth'); // Digest認証用モジュール
>>>>>>> Stashed changes

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

<<<<<<< Updated upstream
=======
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


>>>>>>> Stashed changes
app.get('/proxy', async (req, res) => {
    try {
<<<<<<< Updated upstream
        const { url, id, password } = req.query;

        if (!url || !id || !password) {
            return res.status(400).send('URL, ID, and password are required.');
        }

        // ベーシック認証ヘッダーを作成
        const authHeader = `Basic ${Buffer.from(`${id}:${password}`).toString('base64')}`;

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'Authorization': authHeader,
                // 一部のカメラはブラウザからのリクエストを期待するため、User-Agentを追加
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36'
            },
            timeout: 15000 // タイムアウトを15秒に設定
        });

        // カメラから返されたContent-Typeヘッダーをそのままクライアントに返す
        res.set('Content-Type', response.headers['content-type']);
        res.send(Buffer.from(response.data));
=======
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
>>>>>>> Stashed changes

    } catch (error) {
        console.error('プロキシエラー:', error.message);
        
        if (error.response) {
<<<<<<< Updated upstream
            // サーバーがエラーレスポンスを返した場合
            console.error('ステータス:', error.response.status);
            console.error('レスポンスデータ:', error.response.data.toString());
            res.status(error.response.status).send('カメラサーバーエラー: ' + error.response.statusText);
=======
            const status = error.response.status;
            console.error('最終ステータス:', status);
            // 最終的に401なら、認証情報をクライアントに返す
            res.status(status).send(`カメラサーバーエラー: ${status} ${error.response.statusText}。認証情報を確認してください。`);
>>>>>>> Stashed changes
        } else if (error.request) {
            // リクエストが送信されたが、応答がなかった場合（タイムアウトなど）
            console.error('リクエストが応答しませんでした。');
            res.status(504).send('Gateway Timeout');
        } else {
            // その他の予期せぬエラー
            console.error('リクエスト設定エラー:', error.message);
            res.status(500).send('内部サーバーエラー');
        }
    }
});

app.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました。`);
});