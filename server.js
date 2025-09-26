const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// 認証情報をヘッダーに含めてリクエストを試行する関数
async function attemptRequest(url, id, password) {
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

// 認証情報をURLに組み込んでリクエストを試行する関数
async function attemptUrlAuth(url, id, password) {
    // URLをパースし、認証情報を挿入する
    const urlObj = new URL(url);
    urlObj.username = id;
    urlObj.password = password;

    return axios.get(urlObj.toString(), {
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
        let success = false;

        // 1. Basic認証 (ヘッダー経由) を試行
        try {
            console.log('認証試行 1: Basic認証 (ヘッダー)');
            response = await attemptRequest(url, id, password);
            success = true;
        } catch (error) {
            // 401エラーの場合、次の方法を試す
            if (error.response && error.response.status === 401) {
                console.log('Basic認証失敗 (401)。URL認証を試行します。');
            } else {
                throw error; // その他のエラーはそのままスロー
            }
        }

        // 2. Basic認証が失敗した場合、URLに認証情報を組み込む方法を試行
        if (!success) {
            try {
                console.log('認証試行 2: URL認証');
                response = await attemptUrlAuth(url, id, password);
                success = true;
            } catch (error) {
                // 最終的に失敗した場合、エラーをスロー
                throw error;
            }
        }

        // 成功した場合の処理
        if (success && response) {
            res.set('Content-Type', response.headers['content-type']);
            return res.send(Buffer.from(response.data));
        }

    } catch (error) {
        console.error('プロキシエラー:', error.message);
        if (error.response) {
            console.error('最終ステータス:', error.response.status);
            res.status(error.response.status).send('カメラサーバーエラー: ' + error.response.statusText);
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