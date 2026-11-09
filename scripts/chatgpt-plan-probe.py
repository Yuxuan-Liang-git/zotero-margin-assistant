"""Disposable SIWC verification. OAuth credentials stay in memory, never in reports."""
import base64
import hashlib
import json
import secrets
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa, ec, padding
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

WORK = Path(__file__).resolve().parent.parent / 'evidence' / 'chatgpt-plan-probe'
WORK.mkdir(parents=True, exist_ok=True)
REPORT = WORK / 'report.json'
host_file = WORK / 'host.json'
if not host_file.exists():
    host_file.write_text(json.dumps({'host_id': 'urn:uuid:' + str(uuid.uuid4())}), encoding='utf-8')
host_id = json.loads(host_file.read_text(encoding='utf-8'))['host_id']
state, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
b64 = lambda value: base64.urlsafe_b64encode(value).rstrip(b'=').decode()
decode = lambda value: base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
result = {'stage': 'waiting_for_browser', 'verified': False, 'credentials_persisted': False}
used = False


def report(**values):
    result.update(values)
    REPORT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(values, ensure_ascii=False), flush=True)


def request(url, data=None, token=None, form=False):
    headers = {'User-Agent': 'Zotero-Margin-Assistant-Verification/0.1'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if data is not None:
        headers['Content-Type'] = 'application/x-www-form-urlencoded' if form else 'application/json'
        data = (urlencode(data) if form else json.dumps(data)).encode()
    try:
        return urlopen(Request(url, data=data, headers=headers), timeout=60)
    except HTTPError as error:
        # Never report raw bodies, headers, authorization codes, or tokens.
        report(stage='http_error', http_status=error.code)
        raise RuntimeError('Official endpoint returned HTTP ' + str(error.code)) from None


def verify_id_token(token, client_id):
    head, body, signature = token.split('.')
    header, claims = json.loads(decode(head)), json.loads(decode(body))
    with request('https://auth.openai.com/.well-known/jwks.json') as response:
        keys = json.load(response)['keys']
    key = next(k for k in keys if k['kid'] == header.get('kid'))
    payload, signature = (head + '.' + body).encode(), decode(signature)
    if header['alg'] == 'RS256' and key['kty'] == 'RSA':
        public = rsa.RSAPublicNumbers(int.from_bytes(decode(key['e']), 'big'), int.from_bytes(decode(key['n']), 'big')).public_key()
        public.verify(signature, payload, padding.PKCS1v15(), hashes.SHA256())
    elif header['alg'] == 'ES256' and key['kty'] == 'EC' and key['crv'] == 'P-256':
        public = ec.EllipticCurvePublicNumbers(int.from_bytes(decode(key['x']), 'big'), int.from_bytes(decode(key['y']), 'big'), ec.SECP256R1()).public_key()
        if len(signature) != 64:
            raise ValueError('Invalid signature')
        public.verify(encode_dss_signature(int.from_bytes(signature[:32], 'big'), int.from_bytes(signature[32:], 'big')), payload, ec.ECDSA(hashes.SHA256()))
    else:
        raise ValueError('Unsupported ID-token signature algorithm')
    audience = claims.get('aud', [])
    if isinstance(audience, str):
        audience = [audience]
    if claims.get('iss') != 'https://auth.openai.com' or client_id not in audience or claims.get('exp', 0) <= time.time() or claims.get('nbf', 0) > time.time() + 30 or not secrets.compare_digest(claims.get('nonce', ''), nonce):
        raise ValueError('ID-token claims failed validation')


def infer(tokens):
    scope = set(tokens.get('scope', '').split())
    if 'chatgpt.tokens.use.direct' not in scope:
        raise ValueError('ChatGPT plan permission was not granted')
    access = tokens['access_token']
    with request('https://api.openai.com/v1/models', token=access) as response:
        catalog = json.load(response)
    models = [m for m in catalog.get('models', []) if m.get('visibility') == 'list' and m.get('slug')]
    if not models:
        raise ValueError('No account-specific models were returned')
    selected = next((m for m in models if 'luna' in m['slug'] or 'mini' in m['slug']), models[0])
    report(stage='testing_inference', model=selected['slug'], account_model_count=len(models), id_token_validated=True)
    data = {'model': selected['slug'], 'store': False, 'stream': True, 'input': [{'role': 'user', 'content': 'Reply with exactly: subscription verification OK.'}]}
    completed = False
    with request('https://api.openai.com/v1/responses', data=data, token=access) as response:
        for raw in response:
            line = raw.decode('utf-8').strip()
            if not line.startswith('data:') or line[5:].strip() == '[DONE]':
                continue
            event = json.loads(line[5:].strip())
            if event.get('type') == 'response.completed':
                completed = True
            elif event.get('type') in ('response.failed', 'response.incomplete', 'error'):
                report(stage='inference_failed', terminal=event.get('type'))
                raise RuntimeError('Subscription inference did not complete')
    if not completed:
        raise RuntimeError('No response.completed event received')
    report(stage='completed', verified=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def html(self, text, status=200):
        data = ('<!doctype html><meta charset="utf-8"><title>ChatGPT 订阅验证</title><style>body{font:18px system-ui;max-width:750px;margin:80px auto;line-height:1.7}a{padding:12px;border:1px solid #aaa;border-radius:8px}</style>' + text).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
        self.send_header('Referrer-Policy', 'no-referrer')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        global used
        uri = urlparse(self.path)
        if uri.path == '/':
            return self.html('<h1>Zotero：ChatGPT 订阅验证</h1><p>仅向官方接口发送一句测试文字，不发送 PDF 或聊天历史。授权凭据只存于本次进程内存。</p><p><a href="/start">Continue with ChatGPT</a></p>')
        if uri.path == '/start' and not used:
            params = {'client_id': 'dynamic_agent_client', 'agent_name_hint': 'Zotero Margin Assistant', 'ext_agent_host_id': host_id, 'response_type': 'code', 'redirect_uri': redirect_uri, 'scope': 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', 'resource': 'https://api.openai.com/v1', 'state': state, 'nonce': nonce, 'code_challenge_method': 'S256', 'code_challenge': b64(hashlib.sha256(verifier.encode()).digest())}
            self.send_response(302)
            self.send_header('Location', 'https://auth.openai.com/api/accounts/authorize?' + urlencode(params))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            report(stage='awaiting_official_authorization')
            return
        if uri.path != '/auth/callback' or used:
            return self.html('Not found', 404)
        query = parse_qs(uri.query)
        if not secrets.compare_digest(query.get('state', [''])[0], state):
            return self.html('授权状态不匹配，本次回调已拒绝。', 400)
        used = True
        try:
            if query.get('error'):
                raise ValueError('Authorization was declined or unavailable')
            client_id, code = query.get('client_id', [''])[0], query.get('code', [''])[0]
            if not client_id or client_id == 'dynamic_agent_client' or not code:
                raise ValueError('Registration did not return a client ID and code')
            report(stage='validating_authorization')
            with request('https://auth.openai.com/api/accounts/oauth/token', data={'grant_type': 'authorization_code', 'client_id': client_id, 'code': code, 'code_verifier': verifier, 'redirect_uri': redirect_uri, 'resource': 'https://api.openai.com/v1'}, form=True) as response:
                tokens = json.load(response)
            verify_id_token(tokens['id_token'], client_id)
            infer(tokens)
            tokens.clear()
            self.html('<h1>验证成功</h1><p>官方订阅授权与模型测试请求均已完成。未保存授权凭据，可以关闭此页面。</p>')
        except Exception as error:
            report(stage='verification_failed', error_type=type(error).__name__)
            self.html('<h1>验证尚未成功</h1><p>已记录不含凭据的诊断状态。没有把登录成功当作模型调用成功。</p>', 400)


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
redirect_uri = f'http://127.0.0.1:{server.server_port}/auth/callback'
report(local_url=f'http://127.0.0.1:{server.server_port}/')
timer = threading.Timer(1200, server.shutdown)
timer.daemon = True
timer.start()
try:
    server.serve_forever()
finally:
    server.server_close()
    timer.cancel()
