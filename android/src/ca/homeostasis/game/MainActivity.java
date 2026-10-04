package ca.homeostasis.game;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

/**
 * Coquille Android du jeu : une WebView plein écran qui sert le dossier web/ (copié dans assets/)
 * sous l'origine https://homeostasis.invalid/ (contexte sécurisé, stockage local persistant, WebRTC).
 */
public class MainActivity extends Activity {
    private static final String HOST = "homeostasis.invalid";
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.parseColor("#07111b"));
        getWindow().setNavigationBarColor(Color.parseColor("#07111b"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#07111b"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new AssetClient(this, HOST));
        setContentView(web);
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("https://" + HOST + "/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        // Le bouton Retour ferme d'abord la feuille ouverte dans le jeu, sinon met l'appli en arrière-plan.
        web.evaluateJavascript("(function(){var z=document.getElementById('zoom');if(z&&!z.classList.contains('hidden')){z.click();return true;}var s=document.getElementById('sheet');if(s&&!s.classList.contains('hidden')){var b=s.querySelector('.x');if(b){b.click();}return true;}return false;})()",
                value -> { if (!"true".equals(value)) moveTaskToBack(true); });
    }
}
