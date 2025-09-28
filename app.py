# ---------------------------------------------------------------------
# 💡 バージョン識別: V2.0 (SDカードステータスURLを正しいXMLエンドポイントに再修正)
# ---------------------------------------------------------------------
import os
import requests
from flask import Flask, request, Response
from urllib.parse import urlparse, urlunparse, quote
from requests.auth import HTTPBasicAuth, HTTPDigestAuth
from lxml import etree # XML解析用ライブラリ
import json # JSON応答用

# Flaskアプリケーションの初期化
app = Flask(__name__)

# CORSを許可する設定
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

app.after_request(add_cors_headers)

# ====================================================================
# プロキシエンドポイント (画像取得)
# (V1.6から変更なし)
# ====================================================================
@app.route('/proxy', methods=['GET'])
def proxy_image():
    # 1. クエリパラメータの取得
    url = request.args.get('url')
    id = request.args.get('id')
    password = request.args.get('password')

    if not url:
        return Response('URL is required.', status=400)
    
    # カメラ識別子をログに出力
    camera_identifier = url.split('//')[1].split(':')[0] if '//' in url else url
    
    # キャッシュを完全に禁止するヘッダー
    cache_headers = {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Type': 'image/jpeg' 
    }

    # 認証情報が提供されていない場合は匿名アクセスを試行して終了
    if not id or not password:
        print(f"[{camera_identifier}] 認証情報なし。匿名アクセスを試行")
        try:
            response = requests.get(url, verify=False, timeout=15, headers={'User-Agent': 'Python Camera Proxy'})
            response.raise_for_status()
            return Response(response.content, mimetype=response.headers.get('Content-Type', 'image/jpeg'), headers=cache_headers)
        except Exception as e:
            print(f"[{camera_identifier}] 匿名アクセス失敗: {e}")
            # 匿名アクセス失敗の場合、エラーコードを返さず、後続の認証ロジックに進む
            pass
            
    
    # 認証情報がある場合 (id, passwordが存在)
    try:
        proxied_url = url
        
        # --- 認証試行シーケンス ---
        
        # 1. Basic認証を試行
        auth = HTTPBasicAuth(id, password)
        print(f"[{camera_identifier}] 認証試行 1: Basic認証")
        response = requests.get(
            proxied_url,
            auth=auth,
            verify=False, # SSL証明書の検証をスキップ
            timeout=15,
            headers={'User-Agent': 'Python Camera Proxy'}
        )
        
        if response.status_code == 200:
            print(f"[{camera_identifier}] Basic認証成功。")
            return Response(response.content, mimetype=response.headers.get('Content-Type', 'image/jpeg'), headers=cache_headers)
        
        print(f"[{camera_identifier}] Basic認証失敗 (Status: {response.status_code})。")
        
        # 2. Digest認証を試行 (カメラ1はこれが原因)
        auth = HTTPDigestAuth(id, password)
        print(f"[{camera_identifier}] 認証試行 2: Digest認証")
        # Digest認証は、最初の401レスポンスを受け取った後、自動的に認証情報を付加して再試行します。
        response = requests.get(
            proxied_url,
            auth=auth,
            verify=False, 
            timeout=15,
            headers={'User-Agent': 'Python Camera Proxy'}
        )
        
        if response.status_code == 200:
            print(f"[{camera_identifier}] Digest認証成功。")
            return Response(response.content, mimetype=response.headers.get('Content-Type', 'image/jpeg'), headers=cache_headers)
            
        print(f"[{camera_identifier}] Digest認証失敗 (Status: {response.status_code})。")

        # 3. URL埋め込み認証を試行 (最後の手段)
        parsed_url = urlparse(url)
        netloc_with_auth = f"{quote(id)}:{quote(password)}@{parsed_url.hostname}"
        if parsed_url.port:
            netloc_with_auth += f":{parsed_url.port}"
        proxied_url_embedded = urlunparse(parsed_url._replace(netloc=netloc_with_auth))
        
        print(f"[{camera_identifier}] 認証試行 3: URL埋め込み認証")
        response = requests.get(
            proxied_url_embedded,
            verify=False,
            timeout=15,
            headers={'User-Agent': 'Python Camera Proxy'}
        )

        # 4. 全ての試行の結果を処理
        response.raise_for_status() # 200以外のステータスコードをエラーとして処理

        # 成功の場合
        print(f"[{camera_identifier}] URL埋め込み認証成功。")
        return Response(
            response.content,
            mimetype=response.headers.get('Content-Type', 'image/jpeg'),
            headers=cache_headers
        )

    except requests.exceptions.HTTPError as e:
        status = e.response.status_code
        print(f"[{camera_identifier}] プロキシエラー: HTTPエラー {status} - {e.response.reason}")
        return Response(
            f"カメラサーバーエラー: {status} {e.response.reason}. 詳細: {e}", 
            status=status, 
            headers=cache_headers
        )
    except requests.exceptions.RequestException as e:
        print(f"[{camera_identifier}] プロキシエラー: リクエスト例外 - {e}")
        return Response(
            f"カメラサーバーエラー: 500 Internal Error. 詳細: {e}", 
            status=500, 
            headers=cache_headers
        )
    except Exception as e:
        print(f"[{camera_identifier}] プロキシエラー: 未定義の例外 - {e}")
        return Response(
            f"カメラサーバーエラー: 500 Unknown Error.", 
            status=500, 
            headers=cache_headers
        )

# ====================================================================
# SDカードステータス確認エンドポイント (XML解析対応)
# ====================================================================
@app.route('/status', methods=['GET'])
def check_camera_status():
    url = request.args.get('url')
    id = request.args.get('id')
    password = request.args.get('password')

    if not url:
        # 💡 常にJSONを返すように修正
        return Response(json.dumps({'error': 'URLが必要です。'}), status=400, mimetype='application/json')
    
    camera_identifier = url.split('//')[1].split(':')[0] if '//' in url else url
    
    # 💡 修正: SDカードステータス取得用の正しいパスに戻す
    parsed_url = urlparse(url)
    status_path = '/axis-cgi/disks/list.cgi'
    
    # 新しいステータスURLを作成
    status_url = urlunparse(parsed_url._replace(path=status_path, query='diskid=all'))
    
    print(f"[{camera_identifier}] SDカードステータスチェックURL: {status_url}")

    try:
        # 認証試行シーケンス
        
        # 1. Basic認証
        auth_basic = HTTPBasicAuth(id, password)
        response = requests.get(status_url, auth=auth_basic, verify=False, timeout=10)
        
        if response.status_code == 401:
            # 2. Digest認証
            auth_digest = HTTPDigestAuth(id, password)
            response = requests.get(status_url, auth=auth_digest, verify=False, timeout=10)
        
        # 💡 ステータスコードが200以外の場合、一律でJSONエラーを返す
        if response.status_code != 200:
            print(f"[{camera_identifier}] SDカードステータス取得: 認証/通信失敗 (Status: {response.status_code})")
            # 💡 常にJSONを返すように修正
            return Response(json.dumps({'error': f'SDカードステータス: 認証または通信に失敗しました (Status: {response.status_code})'}), 
                            status=200, # クライアントに正常な応答として返し、エラーメッセージを処理させる
                            mimetype='application/json')

        # ステータスコードが200の場合、XML解析に進む
        content = response.text
        
        # XML解析
        try:
            # DTD参照を削除または無視し、不正なXML構造のエラーを防ぐ
            parser = etree.XMLParser(resolve_entities=False, no_network=True)
            root = etree.fromstring(content.encode('utf-8'), parser)
            
            disk_data = {}
            
            # 💡 修正: ネームスペースを無視して全てのdisk要素を検索 (より堅牢な方法)
            for disk in root.findall('.//{*}disk'):
                disk_id = disk.get('diskid')
                status = disk.get('status', 'UNKNOWN')
                freesize = disk.get('freesize')
                
                # diskidが存在しない要素はスキップする
                if not disk_id:
                    continue

                if freesize:
                    try:
                        # バイトをGBに変換 (1GB = 1024^3 バイト)
                        free_gb = round(int(freesize) / (1024 * 1024 * 1024), 2)
                        freesize_display = f"{free_gb} GB"
                    except ValueError:
                        freesize_display = 'N/A'
                else:
                    freesize_display = 'N/A'

                disk_data[disk_id] = {
                    'status': status,
                    'freesize': freesize_display
                }
                
            return Response(json.dumps(disk_data), status=200, mimetype='application/json')
            
        except etree.XMLSyntaxError as e:
            print(f"[{camera_identifier}] XML解析エラー: {e}")
            # 💡 常にJSONを返すように修正
            return Response(json.dumps({'error': 'SDカードステータス: XML解析に失敗しました。カメラ応答が不正な可能性があります。'}), 
                            status=200, # クライアントに正常な応答として返し、エラーメッセージを処理させる
                            mimetype='application/json')

    except requests.exceptions.RequestException as e:
        print(f"[{camera_identifier}] SDカードチェック通信エラー: {e}")
        # 💡 常にJSONを返すように修正
        return Response(json.dumps({'error': 'SDカードステータス: 通信エラーが発生しました。'}), 
                        status=200, # クライアントに正常な応答として返し、エラーメッセージを処理させる
                        mimetype='application/json')
    except Exception as e:
        print(f"[{camera_identifier}] SDカードチェック不明なエラー: {e}")
        # 💡 常にJSONを返すように修正
        return Response(json.dumps({'error': 'SDカードステータス: サーバー側で不明なエラーが発生しました。'}), 
                        status=200, # クライアントに正常な応答として返し、エラーメッセージを処理させる
                        mimetype='application/json')

# ====================================================================
# サーバー起動
# ====================================================================
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 3000))
    # Flaskの起動時にログを出力
    print(f"サーバー起動: ポート {port}")
    app.run(host='0.0.0.0', port=port)
