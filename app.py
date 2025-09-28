# ---------------------------------------------------------------------
# 💡 バージョン識別: V1.0 (Basic認証とURL認証のみの安定版)
# ---------------------------------------------------------------------
import os
import requests
from flask import Flask, request, Response
from urllib.parse import urlparse, urlunparse, quote
from requests.auth import HTTPBasicAuth

# Flaskアプリケーションの初期化
app = Flask(__name__)

# CORSを許可する設定 (すべてのオリジンを許可)
# 💡 NOTE: Flask-CORSをインストールしなくても、Responseヘッダーで設定可能
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

app.after_request(add_cors_headers)

# ====================================================================
# プロキシエンドポイント
# ====================================================================
@app.route('/proxy', methods=['GET'])
def proxy_image():
    # 1. クエリパラメータの取得
    url = request.args.get('url')
    id = request.args.get('id')
    password = request.args.get('password')

    if not url:
        return Response('URL is required.', status=400)
    
    # キャッシュを完全に禁止するヘッダー
    cache_headers = {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Type': 'image/jpeg' # 画像を返すことを明示
    }

    try:
        # リクエストパラメータの準備
        auth = None
        proxied_url = url
        
        # 認証ロジック (Basic認証 -> URL埋め込み認証 の順で試行)
        
        # 1. Basic認証 (優先)
        if id and password:
            auth = HTTPBasicAuth(id, password)
            print("認証試行 1: Basic認証")
            
            # Basic認証でリクエストを試行
            response = requests.get(
                proxied_url,
                auth=auth,
                verify=False, # SSL証明書の検証をスキップ (多くのカメラで必要)
                timeout=15,
                headers={'User-Agent': 'Python Camera Proxy'}
            )
            
            if response.status_code == 401:
                print("Basic認証失敗 -> URL埋め込み認証を試行")
                
                # 2. URL埋め込み認証 (Basic認証が401の場合にフォールバック)
                parsed_url = urlparse(url)
                # 認証情報をURLに直接埋め込む
                netloc_with_auth = f"{quote(id)}:{quote(password)}@{parsed_url.hostname}"
                if parsed_url.port:
                    netloc_with_auth += f":{parsed_url.port}"
                    
                proxied_url = urlunparse(
                    parsed_url._replace(netloc=netloc_with_auth)
                )
                
                response = requests.get(
                    proxied_url,
                    verify=False,
                    timeout=15,
                    headers={'User-Agent': 'Python Camera Proxy'}
                )
        else:
             # 認証情報がない場合、匿名アクセスを試行
            print("匿名アクセスを試行")
            response = requests.get(
                url,
                verify=False,
                timeout=15,
                headers={'User-Agent': 'Python Camera Proxy'}
            )


        # 3. レスポンスの処理
        response.raise_for_status() # 200以外のステータスコードをエラーとして処理

        # 画像データとしてクライアントに返す
        return Response(
            response.content,
            mimetype=response.headers.get('Content-Type', 'image/jpeg'),
            headers=cache_headers
        )

    except requests.exceptions.HTTPError as e:
        status = e.response.status_code
        print(f"プロキシエラー: HTTPエラー {status} - {e.response.reason}")
        # 400, 401, 404, 500 などのステータスコードをそのままクライアントに返す
        return Response(
            f"カメラサーバーエラー: {status} {e.response.reason}. 詳細: {e}", 
            status=status, 
            headers=cache_headers
        )
    except requests.exceptions.RequestException as e:
        print(f"プロキシエラー: リクエスト例外 - {e}")
        # ネットワークレベルのエラーは500で返す
        return Response(
            f"カメラサーバーエラー: 500 Internal Error. 詳細: {e}", 
            status=500, 
            headers=cache_headers
        )
    except Exception as e:
        print(f"プロキシエラー: 未定義の例外 - {e}")
        return Response(
            f"カメラサーバーエラー: 500 Unknown Error.", 
            status=500, 
            headers=cache_headers
        )

# ====================================================================
# サーバー起動 (Render環境ではホストとポートを環境変数から取得)
# ====================================================================
if __name__ == '__main__':
    # Render環境のPORT環境変数を使用
    port = int(os.environ.get("PORT", 3000))
    app.run(host='0.0.0.0', port=port)
