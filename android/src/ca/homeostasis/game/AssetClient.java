package ca.homeostasis.game;

import android.content.Context;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;

/** Sert les fichiers du dossier assets/ pour l'origine interne du jeu ; laisse passer le reste (PeerJS, etc.). */
public class AssetClient extends WebViewClient {
    private final Context ctx;
    private final String host;

    public AssetClient(Context ctx, String host) {
        this.ctx = ctx;
        this.host = host;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if (!host.equals(request.getUrl().getHost())) return null;
        String path = request.getUrl().getPath();
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        String type = mime(path);
        try {
            InputStream in = ctx.getAssets().open(path.substring(1));
            return new WebResourceResponse(type, type.startsWith("text") ? "utf-8" : null, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
        }
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        return "application/octet-stream";
    }
}
