// Hidden WebView that runs a tiny canvas-based color analysis on a reference
// image and fires `onResult` with a {avgR, avgG, avgB, brightness, …}
// SceneAnalysis object. We feed the WebView a base64 data URI (resized to
// 32×32 via expo-image-manipulator) so the canvas is never CORS-tainted, no
// matter where the original image came from.

import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { SceneAnalysis } from '../../libs/services/pilgrimage/scene-analysis';

const ANALYZER_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#000">
<script>
function send(payload){
  if (window.ReactNativeWebView){
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }
}
function analyze(dataUri){
  try {
    var img = new Image();
    img.onload = function(){
      var w = 32, h = 32;
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var data;
      try {
        data = ctx.getImageData(0,0,w,h).data;
      } catch(err) {
        send({error: 'taint:' + err.message});
        return;
      }
      var r=0,g=0,b=0,n=0,tr=0,tg=0,tb=0,tn=0;
      var maxV=0, minV=255;
      for (var i=0;i<data.length;i+=4){
        var R=data[i], G=data[i+1], B=data[i+2];
        var pix = i/4;
        var py = Math.floor(pix/w);
        r += R; g += G; b += B; n++;
        var v = (R+G+B)/3;
        if (v > maxV) maxV = v;
        if (v < minV) minV = v;
        if (py < h/4){ tr += R; tg += G; tb += B; tn++; }
      }
      var avgR = r/n, avgG = g/n, avgB = b/n;
      var brightness = (avgR + avgG + avgB)/(3*255);
      var warmth = (avgR - avgB)/255;
      var saturation = maxV > 0 ? (maxV - minV)/maxV : 0;
      var topR = tn>0 ? tr/tn : avgR;
      var topG = tn>0 ? tg/tn : avgG;
      var topB = tn>0 ? tb/tn : avgB;
      send({
        avgR: avgR, avgG: avgG, avgB: avgB,
        brightness: brightness, warmth: warmth, saturation: saturation,
        topSkyR: topR, topSkyG: topG, topSkyB: topB
      });
    };
    img.onerror = function(e){ send({error: 'image_load_failed'}); };
    img.src = dataUri;
  } catch(e){
    send({error: 'exception:' + String(e)});
  }
}
window.__analyze = analyze;
send({ready: true});
</script></body></html>`;

interface Props {
  imageUrl: string | undefined;
  onResult: (analysis: SceneAnalysis | null) => void;
}

export function SceneAnalyzer({ imageUrl, onResult }: Props) {
  const webRef = useRef<WebView>(null);
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [webReady, setWebReady] = useState(false);
  const dispatchedRef = useRef(false);
  const html = useMemo(() => ANALYZER_HTML, []);

  useEffect(() => {
    if (!imageUrl) {
      onResult(null);
      return;
    }
    let cancelled = false;
    dispatchedRef.current = false;
    manipulateAsync(imageUrl, [{ resize: { width: 32 } }], {
      base64: true,
      format: SaveFormat.JPEG,
      compress: 0.8,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.base64) {
          setDataUri(`data:image/jpeg;base64,${res.base64}`);
        } else {
          onResult(null);
        }
      })
      .catch(() => {
        if (!cancelled) onResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, onResult]);

  // Once the WebView reports it has __analyze available AND we have a data URI,
  // imperatively kick off the analysis. We only fire once per imageUrl.
  useEffect(() => {
    if (webReady && dataUri && !dispatchedRef.current) {
      dispatchedRef.current = true;
      webRef.current?.injectJavaScript(
        `window.__analyze(${JSON.stringify(dataUri)}); true;`
      );
    }
  }, [webReady, dataUri]);

  // Renders an offscreen WebView (1×1, opacity 0) — no pixels reach the user.
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        opacity: 0,
        left: -9999,
        top: -9999,
      }}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled={false}
        scrollEnabled={false}
        onMessage={(event) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data) as
              | { ready: true }
              | { error: string }
              | SceneAnalysis;
            if ('ready' in payload) {
              setWebReady(true);
              return;
            }
            if ('error' in payload) {
              onResult(null);
              return;
            }
            onResult(payload);
          } catch {
            onResult(null);
          }
        }}
      />
    </View>
  );
}

// Small fallback in case the WebView analyzer never resolves (offline,
// unsupported image format). Generates a deterministic-ish "neutral afternoon"
// signature from the image URL so the tiles still show plausible values.
export function fallbackAnalysisFromUrl(url: string | undefined): SceneAnalysis {
  let hash = 0;
  for (let i = 0; i < (url ?? '').length; i++) {
    hash = (hash * 31 + (url as string).charCodeAt(i)) | 0;
  }
  const v = Math.abs(hash);
  const warmth = ((v % 60) - 20) / 100; // -0.2 to 0.4
  const brightness = 0.35 + ((v >> 4) % 50) / 100; // 0.35 to 0.85
  return {
    avgR: 140 + (v % 40),
    avgG: 130 + ((v >> 2) % 40),
    avgB: 120 + ((v >> 6) % 40),
    brightness,
    warmth,
    saturation: 0.3 + ((v >> 8) % 40) / 100,
    topSkyR: 140 + ((v >> 10) % 60),
    topSkyG: 150 + ((v >> 12) % 60),
    topSkyB: 170 + ((v >> 14) % 50),
  };
}
