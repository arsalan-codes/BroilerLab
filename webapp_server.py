import http.server, gzip, os, mimetypes
from urllib.parse import unquote
WEBAPP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "webapp")
class GzipHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):
        super().__init__(*a, directory=WEBAPP_DIR, **kw)
    def end_headers(self):
        path = self.path.split("?")[0]
        if path.endswith((".js",".css",".html")):
            self.send_header("Cache-Control", "public, max-age=86400")
            if path=="/" or path.endswith("index.html"):
                self.send_header("Cache-Control", "no-cache")
        elif path.endswith((".woff2",".ttf",".png",".jpg",".webp")):
            self.send_header("Cache-Control", "public, max-age=604800, immutable")
        if path.endswith((".js",".css",".html",".json")):
            self.send_header("Vary", "Accept-Encoding")
        super().end_headers()
    def do_GET(self):
        accept = self.headers.get("Accept-Encoding","")
        wants_gzip = "gzip" in accept
        clean = unquote(self.path.split("?")[0])
        fpath = self.translate_path(clean)
        # SPA fallback: clean "/" and unknown extension-less paths serve the app shell
        if os.path.isdir(fpath):
            fpath = os.path.join(fpath, "index.html")
        elif not os.path.isfile(fpath) and "." not in os.path.basename(clean):
            fpath = os.path.join(WEBAPP_DIR, "index.html")
        if os.path.isfile(fpath) and fpath.endswith((".js",".css",".html",".json")) and wants_gzip and os.path.getsize(fpath)>400:
            try:
                with open(fpath,"rb") as f: data=f.read()
                gz=gzip.compress(data, compresslevel=6)
                self.send_response(200)
                self.send_header("Content-Encoding","gzip")
                self.send_header("Content-Length", str(len(gz)))
                ctype,_=mimetypes.guess_type(fpath)
                self.send_header("Content-Type", ctype or "application/octet-stream")
                self.end_headers()
                self.wfile.write(gz)
                return
            except: pass
        return super().do_GET()
if __name__=="__main__":
    import socketserver
    socketserver.TCPServer.allow_reuse_address=True
    with socketserver.TCPServer(("0.0.0.0",8080), GzipHandler) as httpd:
        print("Serving", WEBAPP_DIR, "on 8080 with gzip+cache")
        httpd.serve_forever()
