// Lightweight heuristic scene analysis for the Photo Tips screen.
// We pull average RGB from a downsampled version of the reference image (in a
// hidden WebView canvas) and map those numbers to plausible-sounding photo
// recommendations. Intentionally cheating — no ML, just enough signal so the
// suggestions feel grounded in the actual scene instead of being hardcoded.

export interface SceneAnalysis {
  avgR: number; // 0–255, whole-frame average
  avgG: number;
  avgB: number;
  brightness: number; // 0–1, perceived luminance
  warmth: number; // (R − B) / 255 — positive = warm
  saturation: number; // 0–1 of HSV-style max−min
  topSkyR: number; // top-quarter average
  topSkyG: number;
  topSkyB: number;
}

export interface BestTimeInference {
  jp: string; // tile main value
  en: string; // tile subtitle (label)
  range: string; // tile subtitle (time window)
}

export function inferBestTime(a: SceneAnalysis): BestTimeInference {
  const skyBrightness = (a.topSkyR + a.topSkyG + a.topSkyB) / (3 * 255);
  if (a.brightness < 0.18) {
    return { jp: '夜晚', en: 'Night', range: '19:30 – 22:00' };
  }
  if (a.warmth > 0.18 && a.brightness < 0.55) {
    return { jp: '黃昏', en: 'Golden Hour', range: '17:30 – 18:15' };
  }
  if (a.warmth > 0.08 && a.brightness < 0.45) {
    return { jp: '夕暮', en: 'Dusk', range: '18:30 – 19:15' };
  }
  if (a.warmth < -0.05 && skyBrightness > 0.55 && a.brightness < 0.55) {
    return { jp: '清晨', en: 'Early morning', range: '05:30 – 06:30' };
  }
  if (a.brightness > 0.7) {
    return { jp: '正午', en: 'Midday', range: '11:30 – 13:30' };
  }
  return { jp: '午後', en: 'Afternoon', range: '14:00 – 16:30' };
}

export interface WeatherInference {
  jp: string;
  en: string;
}

export function inferWeather(a: SceneAnalysis): WeatherInference {
  const top = (a.topSkyR + a.topSkyG + a.topSkyB) / 3;
  const skyBlueScore = a.topSkyB - (a.topSkyR + a.topSkyG) / 2;
  const greyDelta =
    Math.max(
      Math.abs(a.topSkyR - a.topSkyG),
      Math.abs(a.topSkyG - a.topSkyB),
      Math.abs(a.topSkyR - a.topSkyB)
    );
  const skyGrey = greyDelta < 18;

  if (skyGrey && top < 110) {
    return { jp: '雨天 / 多雲', en: 'Cloudy / rain' };
  }
  if (skyGrey) {
    return { jp: '陰天', en: 'Overcast' };
  }
  if (skyBlueScore > 28 && a.saturation > 0.3) {
    return { jp: '晴朗', en: 'Clear sky' };
  }
  if (skyBlueScore > 10) {
    return { jp: '晴天 / 薄雲', en: 'Clear w/ thin clouds' };
  }
  if (a.warmth > 0.12 && top > 120) {
    return { jp: '霞 / 黃昏霧', en: 'Hazy golden' };
  }
  return { jp: '多雲', en: 'Partly cloudy' };
}

export interface DistanceInference {
  jp: string;
  en: string;
}

export function inferDistance(a: SceneAnalysis): DistanceInference {
  // Wide outdoor scenes (bright + lots of sky) → recommend stepping back
  // further. Dark indoor / close compositions → less.
  const skyBrightness = (a.topSkyR + a.topSkyG + a.topSkyB) / (3 * 255);
  let metres = 1.8;
  if (a.brightness > 0.55) metres += 0.8;
  if (a.brightness > 0.7) metres += 0.5;
  if (skyBrightness > 0.6) metres += 0.6;
  if (a.saturation > 0.45) metres += 0.3;
  if (a.brightness < 0.3) metres -= 0.4;
  metres = Math.max(1.2, Math.min(metres, 4.5));
  const rounded = (Math.round(metres * 10) / 10).toFixed(1);
  return { jp: `退後 ${rounded}m`, en: `Step back ~${rounded}m` };
}
