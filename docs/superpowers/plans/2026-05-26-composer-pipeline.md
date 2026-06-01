# Aniseekr — Capture / Share / Composer Pipeline Plan

> 日期：2026-05-26
> 範圍：盤點現有 pilgrimage 拍攝→預覽→分享 pipeline，定位 8 個提案功能的狀態，並把「角色疊圖（Companion Composer）」放進這個 pipeline 一起規劃。
> 設計原則：兩個入口（pilgrimage compare + 獨立角色合照）共用底層 composer。

---

## 1. 現況：今天的 pipeline 已經做了什麼

```
┌────────────┐   ┌─────────────┐   ┌───────────┐   ┌─────────┐   ┌───────┐
│ [spotId]   │ → │ align       │ → │ preview   │ → │ share   │ → │ tips  │
│ (camera)   │   │ (alignment) │   │ (review)  │   │ (export)│   │       │
└────────────┘   └─────────────┘   └───────────┘   └─────────┘   └───────┘
```

### 1.1 拍攝層（`compare/[spotId].tsx` + `components/pilgrimage/camera/*`）
| 能力 | 檔案 | 狀態 |
|------|------|------|
| Vision Camera v5 (Nitro) 相機 stage | `CameraStage.tsx` (690 行) | ✅ |
| 動漫場景 overlay（anime / sketch / edge / **subject**） | `OverlayLayer.tsx` + `types.ts:OverlayMode` | ✅ `subject` 已預留 enum |
| Gesture-based overlay 操作（pinch/pan/rotate） | `OverlayLayer.tsx` 內 `GestureDetector` | ✅ |
| `editMode` 切換 pointerEvents（gesture 不互搶） | `OverlayLayer.tsx:64` | ✅ |
| Zoom dial、focus reticle、exposure bar | `ZoomDial.tsx`, `FocusReticle.tsx`, `VerticalExposureSlider.tsx` | ✅ |
| Auto-capture、burst、countdown | `AutoCaptureBadge/Toast.tsx`, `BurstIndicator.tsx`, `CountdownOverlay.tsx` | ✅ |
| Scene switcher、reference thumbnail | `SceneSwitcherSheet.tsx`, `ReferenceThumbnail.tsx` | ✅ |
| Camera settings sheet | `CameraSettingsSheet.tsx` | ✅ |
| GPU resizer（為 ML pipeline 預備） | `react-native-vision-camera-resizer` 已安裝 | ✅ |

### 1.2 對齊與分析（`align.tsx` + `libs/services/pilgrimage/`）
| 能力 | 檔案 | 狀態 |
|------|------|------|
| Heading / position / tilt 對齊評分 | `alignment-scoring.ts` | ✅ |
| Sensor snapshot 平滑與發佈 | `alignment-sensor-state.ts` | ✅ |
| 64×64 GPU downsample + scene analysis | `scene-analyzer.ts`, `scene-analysis.ts` | ✅ |
| Frame match 三路權重（histogram 0.55 / edge 0.30 / lighting 0.15） | `frame-match.ts` | ✅ |
| Capture lens gate（覆蓋鏡頭/失焦偵測） | `capture-lens-gate.ts` | ✅ |
| 4-bit RGB palette 抽 top-5 dominant color | `scene-analysis.ts:269` | ✅ |

### 1.3 預覽層（`compare/preview.tsx`，1753 行）
| 能力 | 狀態 |
|------|------|
| 5 種對比模式：`stacked / sideBySide / overlay / slider / full` | ✅ |
| Filmstrip 多張選擇、批次保存 | ✅ |
| Frame match 指標可視化（histogram / edge / overall %） | ✅ |
| Capture EXIF info card | ✅ |
| `react-native-view-shot` 抓 stage 畫面 → PNG → MediaLibrary | ✅ |

### 1.4 分享層（`share.tsx` + `ShareCard.tsx`）
| 能力 | 狀態 |
|------|------|
| 5 templates：`polaroid / classic / minimal / comic / manga` | ✅ |
| 3 ratios：`1:1 / 9:16 / 16:9` | ✅ |
| 圖片配置依 ratio 自動切換 stacked / side-by-side | ✅ |
| 顯示 toggle：`showScore / showLocation / showDate` | ✅ |
| 平台分流：Instagram / Twitter / LINE / system share | ✅ |
| Caption builder（自動 hashtag 拼裝） | ✅ |
| CC BY-NC-SA 4.0 anime 場景歸屬標示 | ✅ |
| view-shot → PNG → MediaLibrary 保存 | ✅ |

### 1.5 已安裝但未充分使用的工具
| 套件 | 用途 | 目前使用 |
|------|------|----------|
| `expo-image-manipulator` ~14 | crop / resize / rotate | 未在 compare/share 流程使用 |
| `@shopify/react-native-skia` 2.2 | ColorMatrix / ImageFilter / Shader | 只用於 overlay 顯示，沒做 filter |
| `react-native-nitro-modules` | Native bridge | Vision Camera 用到，業務模組尚未自建 |

---

## 2. 8 個提案功能 — done / partial / not-done 矩陣

| # | 功能 | 中文 / 描述 | 現況 | 缺什麼 | 難度 | 投入 |
|---|------|-----|------|--------|------|------|
| 1 | **底色選項** | Background color picker for share card | ✅ Track A 完成 (2026-05-26)：`customBg` prop + 12 色 swatch palette + reset；自動 contrast watermark/caption ink | — | 低 | 0.5 週 |
| 2 | **照片/截圖順序選項** | Reference vs user photo order (which on top) | ✅ Track A 完成 (2026-05-26)：`swapOrder` prop + `resolveImagePairOrder` 純函式；ANIME-first ↔ REAL-first chip | — | 低 | 0.5 天 |
| 3 | **文字水印選項** | Custom text watermark on output | ✅ Track A + Phase 2 完成：80 字上限 + HTML 防注入、5 種位置、opacity slider、5 種字體（system/serif/mono/bold/cursive）、8 色 swatch（含 auto-contrast）、自動 text-shadow | — | 中 | 1 週 |
| 4 | **照片濾鏡調整選項** | Color filter presets on user photo | ✅ Track B 完成 (2026-05-26)：6 種預設 (`cinematic/soft/anime/contrast/warm/cool`) + intensity slider；`<FilteredImage/>` 自動切 Skia ColorMatrix 路徑、identity 走 expo-image fast path | — | 中 | 1.5 週 |
| 5 | **分析截圖自動調整** | Auto-apply reference's lighting/color to user photo | ✅ Track C 完成 (2026-05-26)：`loadAutoColorMatrix(refUri, shotUri)` 跑 Skia 64×64 downsample → `reducePixels` 拿 avgR/G/B → `applyAutoColorMatrix` 推 ColorMatrix；UI toggle 含 loading + 不可用態 | — | 中高 | 2 週 |
| 6 | **濾鏡分辨率調整** | Export resolution control | ✅ Track A 完成 (2026-05-26)：`getExportDimensions(ratio, '720p'\|'1080p'\|'4k')` 推導出 captureRef pixel size；短邊基準 | — | 低中 | 0.5 週 |
| 7 | **照片裁切選項** | Crop user photo (post-capture) | ✅ Track B + Phase 2 完成：`<CropSheet/>` 全螢幕 modal + Pan + Pinch zoom (1×–4×, clamp pan to zoomed bounds) + rule-of-thirds grid + 5 aspect chips (Free/1:1/9:16/16:9/Match anime) + `expo-image-manipulator` apply | — | 中 | 1 週 |
| 8 | **透視拉伸選項** | Perspective warp to match reference | ✅ Phase 1 + 2 完成：`computeHomography()` DLT solver、`tiltCorrectionTransform()` auto-from-sensor、`<CornerPinSheet/>` 4 角拖拉編輯器 + `cornerPinHomography()` + `homographyToMatrix4()` → RN `transform: [{ matrix }]` 套到 ShareCard user-shot 層 | — | 高 | 2-3 週 |

### 圖示說明
- ✅ 已完成（在生產代碼裡可用）
- 🟡 部分／半套（基礎建設有，但未串接到 UX 或缺主要功能）
- ❌ 未開始（沒有對應實作或註解明示「沒做」）

### 投入小計：低成本快贏 vs. 重型專案
- **快贏（≤ 1 週/項）**：#1 底色、#2 順序 swap、#3 水印、#6 解析度 → 約 **2.5 週**搞定 4 項，立刻提升 ShareCard 完成度
- **中型（1-2 週/項）**：#4 濾鏡預設、#7 裁切 → **2-3 週**
- **重型（2-3 週/項）**：#5 自動色調匹配、#8 透視拉伸 → **4-5 週**

---

## 3. 未來：角色疊圖（Companion Composer）

### 3.1 為什麼放在這份 doc 裡
所有 8 項功能本質上都是「對輸出畫面做後處理」，跟角色疊圖共享同一個 composer 底層。先把濾鏡/裁切/水印的基礎打好，角色層只是再多一層 Skia layer。

### 3.2 共用 composer 架構
```
┌──────────────────────────────────────────────────────────┐
│  <Composer>                                              │
│  共用底層 — pilgrimage compare 與獨立 companion 兩入口都用 │
│                                                          │
│  Layers (Skia, 由下往上):                                 │
│    1. Background    ← Camera frame / 匯入照片             │
│    2. Background BG ← 底色 / 漸層（#1）                   │
│    3. Crop frame    ← 裁切遮罩（#7）                      │
│    4. Perspective   ← 4 角 warp matrix（#8）              │
│    5. Photo filter  ← ColorMatrix（#4 + #5 自動）         │
│    6. Lighting probe (worklet, 採樣不渲染)                 │
│    7. Shadow        ← Skia BlurMask（角色疊圖 Phase 2）   │
│    8. Character     ← SkImage + ColorMatrix（疊圖核心）   │
│    9. Occlusion     ← Depth/segmentation mask（Phase 3）  │
│   10. Watermark     ← 文字 / logo（#3）                   │
│   11. ShareCard chrome ← 既有 template（已完成）           │
└──────────────────────────────────────────────────────────┘
```

### 3.3 三階段計畫（角色疊圖部分）

#### Phase 1 — MVP：能匯入、能疊、能拍（1.5–2 週）
- **Nitro 模組 `subject-lifter`**
  - iOS 17+：`VisionKit.ImageAnalyzer` + `VNGenerateForegroundInstanceMaskRequest`
  - iOS 16 fallback：`VNGeneratePersonSegmentationRequest`
  - Android：`com.google.android.gms:play-services-mlkit-subject-segmentation`
  - API：
    ```ts
    interface SubjectLifter extends HybridObject {
      lift(imageUri: string): Promise<{ uri: string; width: number; height: number }>;
      isSupported(): boolean;
    }
    ```
- **Character Library store**（MMKV）
  - schema：`{ id, displayName, sourceUri, cutoutUri, thumbUri, intrinsicWH, createdAt }`
  - 配額：free 上限 20（cutout 存 FileSystem，MMKV 只存 metadata）
- **`<CharacterLayer/>`**
  - 仿 `OverlayLayer.tsx` 結構
  - Gesture：`Gesture.Simultaneous(pinch, pan, rotation)`
  - 雙擊 = flip；長按 = 換角色
- **整合到 compare/[spotId].tsx**
  - `OverlayControlsBar.tsx` 加 chip：「角色」
  - `CharacterPickerSheet`（仿 `SceneSwitcherSheet`）
  - Capture：Skia `Canvas.makeImageSnapshot()` → 走原本 preview/share
- **獨立入口**
  - 新 route：`app/(tabs)/companion/index.tsx`
  - 共用 `<Composer/>`，無 spot context

#### Phase 2 — 中階：自動光照配色 + 假陰影（2–3 週）
- **Lighting Probe（frame processor worklet）**
  - ROI = 角色腳下 200×100 區域 → resizer 降到 64×32 → 算 avgL + 色溫
  - 採樣 5–10Hz，throttled
- **Character Color Match**
  - probe 結果轉 Skia `ColorMatrix`
  - 亮度 multiply + 色溫偏移（暖光 R*1.05 G*0.98 B*0.92）
- **Shadow（Skia 假陰影）**
  - 橢圓 BlurMask + 半透明黑
  - 從 motion sensor 推估光源方位
- **用戶覆寫**
  - 「光線」chip → drawer：亮度/暖冷/陰影強度/陰影方向

#### Phase 3 — 進階：深度遮擋 + 平面對齊（4–6 週，可延後）
- **選項 A（推薦）**：Vision Camera + Core ML/TFLite MiDaS 深度
  - 跨平台同套，frame processor ~10fps 更新
  - Skia 用深度圖當 mask
- **選項 B**：切到 ARKit/ARCore session
  - 品質天花板最高，但等於重寫一條相機路徑

> 建議：Phase 3 先做選項 A 的「淺版」（只做深度遮擋，不做平面對齊），佔 30% 工作量拿 70% 效果。

---

## 4. 建議實作順序（依風險與槓桿）

### Track A：ShareCard 完成度（快贏，總計 ~2.5 週）✅ Done (2026-05-26)
> 目標：把已經 80% 完成的分享流程補滿到 100%。

1. ✅ **#2 順序 swap chip** — `swapOrder` prop + `resolveImagePairOrder()` 純函式；Polaroid/Classic/Minimal/Comic 走 `<ImagePair/>`，Manga 走 inline cells map
2. ✅ **#1 底色 picker** — `customBg` prop + `resolveBackgroundColor()` (template default → theme fallback → user override)；12 色 swatch（含 reset）；caption ink 自動 contrast
3. ✅ **#3 文字水印** — `<WatermarkOverlay/>` + `normalizeWatermarkText` (80 字 cap + HTML 防注入) + `getWatermarkAlignment` (4 角 + 中央) + opacity slider + auto text-shadow
4. ✅ **#6 輸出解析度** — `getExportDimensions(ratio, '720p'|'1080p'|'4k')`；`captureRef({ width, height })` 渲染到目標 pixel size
5. ✅ TDD — 17 個單元測試 (`__tests__/unit/pilgrimage/share-composer.test.ts`)；組件解耦：純函式在 `libs/services/pilgrimage/share-composer.ts`，UI chips/swatches/slider 在 `components/pilgrimage/ShareComposerControls.tsx`

### Track B：照片後處理（中型，總計 ~2.5 週）✅ Done (2026-05-26)
> 目標：自拍照變得能調，不只是貼上去。

5. ✅ **#4 濾鏡預設** — 7 個 preset（含 none）+ `getFilterMatrix(id, intensity)` + `blendColorMatrix` linear interp from identity；`<FilteredImage/>` 走 Skia Canvas + ColorMatrix declarative path（user 圖才套，anime ref 維持原樣）
6. ✅ **#7 裁切** — `<CropSheet/>` Modal + Reanimated Pan gesture + `panToCropRegion()` 純函式（測試覆蓋邊界 clamp）+ `expo-image-manipulator` Apply；croppedShotUri 取代原 shotUri 給 ShareCard
7. ✅ TDD — 22 個單元測試 (`__tests__/unit/pilgrimage/share-filters.test.ts`)：preset shape、intensity blend、auto color match clamp、center/pan crop region

### Track C：智能匹配（重型，總計 ~5 週）✅ Done Phase 1 (2026-05-26)
> 目標：分析資料不再只是裝飾，真的能用來改畫面。

7. ✅ **#5 自動色調匹配** — `loadAutoColorMatrix(refUri, shotUri)` async pipeline + UI toggle (auto/loading/disabled)；overrides preset filter when active
8. ✅ **#8 透視拉伸 Phase 1** — DLT homography solver + `tiltCorrectionTransform({tiltDeg, headingDeltaDeg})` ±15° clamp；auto-from-sensor toggle (依 route params 顯示／停用)；下游 capture flow 還沒傳 sensor params → toggle 預設 disabled。Phase 2 4 角手動 editor pending
9. ✅ TDD — 12 個單元測試 (`__tests__/unit/pilgrimage/share-auto-match.test.ts`)：safe-band clamp、identity edge cases、DLT degenerate input、sensor zero-state

### Track D：角色疊圖 Companion（新功能線，可獨立進行）
9. ✅ **Companion Phase 1 MVP + 1B compare integration** (2026-05-27) — SubjectLifter TS spec + JS fallback；MMKV character library + 20-entry quota；`<CharacterLayer/>` (Pan/Pinch/Rotation/Double-tap flip/Long-press swap)；`<CharacterPickerSheet/>`；`/companion` standalone route；`<CompanionOverlay/>` chip 已掛到 compare/[spotId] 做即時 positioning guide；12 單元測試。待後續：(a) Phase 1C 捕獲合成（Skia compositor 把 character bake 進 takePhoto 結果）；(b) native subject-lifter Nitro module
10. ✅ **Companion Phase 2** (2026-05-27) — `deriveCharacterTint(bgAnalysis, charAnalysis)` 透過 Skia `analyzeImage` 抓兩張的 avgRGB，再 lerp 0.45 到 `applyAutoColorMatrix` 結果；`<CharacterLayer/>` Phase 2 加 Skia `<Oval>` + `<BlurMask>` 腳底陰影 + `<FilteredImage>` tint pipeline；companion route 加 Tint/Shadow toggle chips；6 個新單元測試（含 identity edge cases + ellipse geometry）。Live-camera lighting probe (frame processor worklet) 留作 Phase 2B
11. ✅ **Nitro subject-lifter spec scaffolding** (2026-05-27) — `subject-lifter.nitro.ts` 宣告 `HybridObject<{ ios:'swift', android:'kotlin' }>` interface（讓 `bunx nitrogen --paths libs/services/companion` 可以直接 codegen）；`subject-lifter.ts` runtime 動態 require Nitro module，找不到時 fallback 到 `jsSubjectLifter`；測試環境完全不會 trip 到 turbomodule install。Native Swift (VisionKit) / Kotlin (MLKit) 實作仍待後續
12. **Companion Phase 3**（4–6 週，待 Phase 1+2 收 feedback 後決定）— 深度遮擋

---

## 5. 風險與開放問題

### 技術風險
| 風險 | 緩解 |
|------|------|
| ShareCard 已有 5 templates × 3 ratios = 15 組合，新增水印/底色會放大維度 | 把 watermark/customBg 抽到 ShareCard 上層，templates 接受 props 而非各自實作 |
| Skia ColorMatrix 在低階 Android 會卡 | 預設 `filter quality = balanced`，提供「儲存高品質」開關 |
| Subject lifting 對複雜背景失敗 | Fallback：手動 finger-paint mask（Skia path） |
| Capture 時記憶體峰值（Skia canvas + camera frame + character cutout） | 加上 OOM 守門：若 cutout > 4096px 自動降採樣 |

### 產品/法律
| 問題 | 處理 |
|------|------|
| 用戶匯入侵權圖 → 法律 | ToS 明訂用戶自負；首次匯入彈一次性同意框；不上傳服務器 |
| 用戶把角色 PNG 用來 deepfake 真人 | 不在 face 上做特別優化；標準 ToS；不主動推薦人臉素材 |
| 自訂水印變成攻擊面（XSS / 字串注入） | 純文字輸入，限制 80 字元，不接受 HTML/markdown |

### 待決定
1. **獨立 companion 入口要不要進 main tabs？** Pilgrimage 整合是核心場景，但 companion 可能是更廣的留存點。
2. **角色配額 20 個適合嗎？** Free posture 下，是否該更激進（例如 5 個）保留升級空間？
3. **要支援 Live Photo / 短影片？** 還是只靜態圖優先？
4. **Track A-D 的順序**：建議 A → B → D Phase 1 → C → D Phase 2/3。但 D Phase 1 也可以跟 A 並行（兩條線無強依賴）。

---

## 6. 與 CLAUDE.md 規則的對齊檢查

- **規則 8（No fake data）**：自動配色/陰影/透視 warp 都來自實際分析或用戶輸入，沒有 hash-seed 假資料。失敗時走 fallback 而非「看起來像」的數值。
- **規則 9（State ownership）**：所有 gesture transform 走 Reanimated SharedValue，不進 React state。Composer 只持有「目前 selectedCharacterId / selectedFilterId」這種 coarse state。
- **規則 10（Navigation feel）**：Composer 元件接受 `initialState` props（character、filter、crop）做 frame-1 paint；async 動作只在 Phase 2 lighting probe 跑（背景 worklet）。
- **規則 4（Colors from theme）**：所有 UI chrome 走 `useTheme()`；只有用戶自選的「水印顏色 / 底色」例外，因為定義上就是用戶覆寫。
- **規則 1（ThemedButton）**：所有新增控件按鈕都用 `ThemedButton` / `ThemedIconButton`。
