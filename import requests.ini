import requests
import os

# --- 設定情報 (使用中のID/PASSに置き換えてください) ---
CAMERA_URL = "http://szfb263.glddns.com:8080/axis-cgi/jpg/image.cgi?resolution=720x480&compression=30"
USERNAME = "root"  # あなたのカメラID
PASSWORD = "saftec1" # あなたのカメラPASS (正確な値に置き換えてください)
OUTPUT_FILENAME = "axis_image_python.jpg"
# ----------------------------------------------------

def fetch_image_with_digest():
    """Pythonのrequestsライブラリを使ってDigest認証で画像をフェッチする"""
    print(f"カメラURL: {CAMERA_URL}")
    print(f"ID: {USERNAME}")
    
    try:
        # requestsにDigest認証を任せる
        response = requests.get(
            CAMERA_URL,
            auth=requests.auth.HTTPDigestAuth(USERNAME, PASSWORD),
            timeout=10,
            verify=False # HTTPSではないので通常は不要だが、念のため
        )

        # ステータスコードの確認
        if response.status_code == 200:
            # 成功: 画像をファイルに保存
            with open(OUTPUT_FILENAME, 'wb') as f:
                f.write(response.content)
            print("✅ 成功！画像が取得され、ファイルに保存されました。")
            print(f"ファイル名: {os.path.abspath(OUTPUT_FILENAME)}")
            return True
        
        elif response.status_code == 401:
            # 認証失敗
            print("❌ 認証失敗 (401 Unauthorized)。ID/PASSが間違っているか、カメラが非標準プロトコルを使用しています。")
            return False
        
        else:
            # その他のエラー
            print(f"⚠️ リクエストエラー: ステータスコード {response.status_code}")
            return False

    except requests.exceptions.Timeout:
        print("🚨 タイムアウトエラー: カメラからの応答がありませんでした。")
    except requests.exceptions.RequestException as e:
        print(f"🚨 ネットワークエラーが発生しました: {e}")
    
    return False

if __name__ == "__main__":
    fetch_image_with_digest()