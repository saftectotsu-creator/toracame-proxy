const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { URL } = require('url');
// ⭐️ 確実に存在するDigest認証モジュールを使用
const fetch = require('node-fetch');
const DigestFetch = require('digest-fetch'); 

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
            'User-Agent': 'Mozilla/5.0'
        },
        timeout: 15000 
    });
}

// 認証試行関数 2: Digest認証 (digest-fetchを使用)
async function attemptDigestAuth(url, id, password) {
    // Digestクライアントを初期化
    const digestClient = new DigestFetch(id, password, { 
        // node-fetchを使うように指定 (Axiosではない)
        fetch: fetch 
    });

    // fetchでリクエストを実行
    const response = await digestClient.fetch(url, {
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0'
        },
        timeout: 15000 
    });

    // 認証失敗時、次の認証試行へ移行するためにエラーを投げる
    if (response.status === 401) {
        throw { response: { status: 401, statusText: response.statusText || 'Unauthorized' } };
    }

    if (!response.ok) {
        // 404, 500などのエラーもAxios形式に変換してreject
        throw { 
            response: { 
                status: response.status, 
                statusText: response.statusText || 'Internal Error'
            } 
        };
    }
    
    // 成功した場合 (200)
    const buffer = await response.arrayBuffer();
    return {
        data: Buffer.from(buffer), // Bufferデータ
        headers: response.headers,
        status: response.status
    };
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
            'User-Agent': 'Mozilla/5.0'
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