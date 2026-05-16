/* eslint-env node */
/* global __dirname */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const EXPO_CAMERA_VIEW = path.join(
  'node_modules',
  'expo-camera',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'camera',
  'ExpoCameraView.kt'
);

const EXPO_CAMERA_MODULE = path.join(
  'node_modules',
  'expo-camera',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'camera',
  'CameraViewModule.kt'
);

function replaceOnce(contents, search, replacement, label) {
  if (!contents.includes(search)) {
    throw new Error(`with-android-camera-native-layer: missing patch anchor ${label}`);
  }
  return contents.replace(search, replacement);
}

function insertAfterOnce(contents, search, insertion, label) {
  if (contents.includes(insertion.trim())) {
    return contents;
  }
  return replaceOnce(contents, search, `${search}${insertion}`, label);
}

function patchExpoCameraView(contents) {
  if (contents.includes('cameraExtensionModeToCameraXMode')) {
    return contents;
  }

  contents = insertAfterOnce(
    contents,
    'import androidx.camera.core.resolutionselector.ResolutionStrategy\n',
    'import androidx.camera.extensions.ExtensionMode\nimport androidx.camera.extensions.ExtensionsManager\n',
    'extensions imports'
  );
  contents = insertAfterOnce(
    contents,
    'import kotlinx.coroutines.launch\n',
    'import kotlinx.coroutines.suspendCancellableCoroutine\n',
    'coroutine import'
  );
  contents = insertAfterOnce(
    contents,
    'import kotlin.math.roundToInt\n',
    'import kotlin.coroutines.resume\n',
    'resume import'
  );

  contents = insertAfterOnce(
    contents,
    '  var camera: Camera? = null\n',
    '  private var hdrExtensionAvailable = false\n  private var nightExtensionAvailable = false\n  private var autoExtensionAvailable = false\n  private var activeCameraExtensionMode = "none"\n',
    'extension availability fields'
  );

  contents = insertAfterOnce(
    contents,
    `  var zoom: Float = 0f
    set(value) {
      field = value
      setCameraZoom(value)
    }
`,
    `
  var zoomRatio: Float? = null
    set(value) {
      field = value
      setCameraZoomRatio(value)
    }

  var cameraExtensionMode: String = "none"
    set(value) {
      val normalized = if (value == "hdr") "hdr" else "none"
      if (field != normalized) {
        field = normalized
        shouldCreateCamera = true
      }
    }
`,
    'zoomRatio and cameraExtensionMode properties'
  );

  contents = replaceOnce(
    contents,
    `    val cameraSelector = CameraSelector.Builder()
      .requireLensFacing(lensFacing.mapToCharacteristic())
      .build()
`,
    `    val baseCameraSelector = CameraSelector.Builder()
      .requireLensFacing(lensFacing.mapToCharacteristic())
      .build()

    val extensionsManager = getExtensionsManagerSafely(cameraProvider)
    updateExtensionAvailability(extensionsManager, baseCameraSelector)
    val extensionMode = cameraExtensionModeToCameraXMode(cameraExtensionMode)
    val extensionActive = extensionsManager != null &&
      extensionMode != ExtensionMode.NONE &&
      isExtensionAvailableSafely(extensionsManager, baseCameraSelector, extensionMode)
    val cameraSelector = if (extensionActive) {
      getExtensionEnabledCameraSelectorSafely(extensionsManager, baseCameraSelector, extensionMode)
        ?: baseCameraSelector
    } else {
      baseCameraSelector
    }
`,
    'camera selector extension hook'
  );

  contents = replaceOnce(
    contents,
    `        imageAnalysisUseCase?.let {
          addUseCase(it)
        }
`,
    `        if (!extensionActive) {
          imageAnalysisUseCase?.let {
            addUseCase(it)
          }
        }
`,
    'disable image analysis during extension session'
  );

  contents = replaceOnce(
    contents,
    `      // Set the previous zoom level after recreating the camera
      setCameraZoom(zoom)
`,
    `      // Set the previous zoom level after recreating the camera.
      zoomRatio?.let { setCameraZoomRatio(it) } ?: setCameraZoom(zoom)
`,
    'restore zoom ratio after bind'
  );

  contents = replaceOnce(
    contents,
    `      camera = cameraProvider.bindToLifecycle(currentActivity, cameraSelector, useCases)
      camera?.let {
        observeCameraState(it.cameraInfo)
      }
`,
    `      camera = cameraProvider.bindToLifecycle(currentActivity, cameraSelector, useCases)
      camera?.let {
        activeCameraExtensionMode = if (extensionActive) cameraExtensionMode else "none"
        observeCameraState(it.cameraInfo)
      }
`,
    'active extension mode after bind'
  );

  contents = replaceOnce(
    contents,
    `    } catch (_: Exception) {
      onMountError(
`,
    `    } catch (_: Exception) {
      activeCameraExtensionMode = "none"
      onMountError(
`,
    'clear active extension mode on bind failure'
  );

  contents = replaceOnce(
    contents,
    `  private fun setCameraZoom(value: Float) {
    val maxZoomRatio = camera?.cameraInfo?.zoomState?.value?.maxZoomRatio ?: 1f
    val targetZoomRatio = max(1f, min(maxZoomRatio, value.coerceIn(0f, 1f) * maxZoomRatio))
    camera?.cameraControl?.setZoomRatio(targetZoomRatio)
  }
`,
    `  private fun setCameraZoom(value: Float) {
    if (zoomRatio != null) {
      return
    }
    val maxZoomRatio = camera?.cameraInfo?.zoomState?.value?.maxZoomRatio ?: 1f
    val targetZoomRatio = max(1f, min(maxZoomRatio, value.coerceIn(0f, 1f) * maxZoomRatio))
    camera?.cameraControl?.setZoomRatio(targetZoomRatio)
  }

  private fun setCameraZoomRatio(value: Float?) {
    val camera = camera ?: return
    if (value == null) {
      setCameraZoom(zoom)
      return
    }
    val zoomState = camera.cameraInfo.zoomState.value
    val minZoomRatio = zoomState?.minZoomRatio ?: 1f
    val maxZoomRatio = zoomState?.maxZoomRatio ?: 1f
    val targetZoomRatio = min(maxZoomRatio, max(minZoomRatio, value))
    camera.cameraControl.setZoomRatio(targetZoomRatio)
  }

  fun getNativeCameraCapabilities(): Bundle {
    val zoomState = camera?.cameraInfo?.zoomState?.value
    val minZoomRatio = zoomState?.minZoomRatio ?: 1f
    val maxZoomRatio = zoomState?.maxZoomRatio ?: 1f
    val zoomRatio = zoomState?.zoomRatio ?: 1f
    return Bundle().apply {
      putDouble("minZoomRatio", minZoomRatio.toDouble())
      putDouble("maxZoomRatio", maxZoomRatio.toDouble())
      putDouble("zoomRatio", zoomRatio.toDouble())
      putBoolean("supportsZoomOut", minZoomRatio < 1f)
      putString("activeExtensionMode", activeCameraExtensionMode)
      putBundle("extensions", Bundle().apply {
        putBoolean("hdr", hdrExtensionAvailable)
        putBoolean("night", nightExtensionAvailable)
        putBoolean("auto", autoExtensionAvailable)
      })
    }
  }

  private suspend fun getExtensionsManagerSafely(cameraProvider: ProcessCameraProvider): ExtensionsManager? =
    suspendCancellableCoroutine { continuation ->
      val future = ExtensionsManager.getInstanceAsync(context, cameraProvider)
      future.addListener(
        {
          val manager = try {
            future.get()
          } catch (_: Exception) {
            null
          }
          if (continuation.isActive) {
            continuation.resume(manager)
          }
        },
        ContextCompat.getMainExecutor(context)
      )
      continuation.invokeOnCancellation {
        future.cancel(true)
      }
    }

  private fun updateExtensionAvailability(
    extensionsManager: ExtensionsManager?,
    cameraSelector: CameraSelector
  ) {
    hdrExtensionAvailable = isExtensionAvailableSafely(
      extensionsManager,
      cameraSelector,
      ExtensionMode.HDR
    )
    nightExtensionAvailable = isExtensionAvailableSafely(
      extensionsManager,
      cameraSelector,
      ExtensionMode.NIGHT
    )
    autoExtensionAvailable = isExtensionAvailableSafely(
      extensionsManager,
      cameraSelector,
      ExtensionMode.AUTO
    )
  }

  private fun isExtensionAvailableSafely(
    extensionsManager: ExtensionsManager?,
    cameraSelector: CameraSelector,
    extensionMode: Int
  ): Boolean {
    return try {
      extensionsManager?.isExtensionAvailable(cameraSelector, extensionMode) == true
    } catch (_: Exception) {
      false
    }
  }

  private fun getExtensionEnabledCameraSelectorSafely(
    extensionsManager: ExtensionsManager,
    cameraSelector: CameraSelector,
    extensionMode: Int
  ): CameraSelector? {
    return try {
      extensionsManager.getExtensionEnabledCameraSelector(cameraSelector, extensionMode)
    } catch (_: Exception) {
      null
    }
  }

  private fun cameraExtensionModeToCameraXMode(mode: String): Int {
    return when (mode) {
      "hdr" -> ExtensionMode.HDR
      else -> ExtensionMode.NONE
    }
  }
`,
    'native zoom ratio and capabilities'
  );

  return contents;
}

function patchCameraViewModule(contents) {
  if (contents.includes('Prop("cameraExtensionMode")')) {
    return contents;
  }

  contents = insertAfterOnce(
    contents,
    `      Prop("zoom") { view, zoom: Float? ->
        zoom?.let {
          if (view.zoom != it) {
            view.zoom = it
          }
        } ?: run {
          if (view.zoom != 0f) {
            view.zoom = 0f
          }
        }
      }
`,
    `
      Prop("zoomRatio") { view, zoomRatio: Float? ->
        if (view.zoomRatio != zoomRatio) {
          view.zoomRatio = zoomRatio
        }
      }

      Prop("cameraExtensionMode") { view, mode: String? ->
        val next = mode ?: "none"
        if (view.cameraExtensionMode != next) {
          view.cameraExtensionMode = next
        }
      }
`,
    'view props'
  );

  contents = insertAfterOnce(
    contents,
    `      AsyncFunction("getAvailablePictureSizes") { view: ExpoCameraView ->
        return@AsyncFunction view.getAvailablePictureSizes()
      }
`,
    `
      AsyncFunction("getNativeCameraCapabilities") { view: ExpoCameraView ->
        return@AsyncFunction view.getNativeCameraCapabilities()
      }
`,
    'capability method'
  );

  return contents;
}

function patchFile(projectRoot, relativePath, patcher) {
  const filePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`with-android-camera-native-layer: cannot find ${relativePath}`);
  }
  const before = fs.readFileSync(filePath, 'utf8');
  const after = patcher(before);
  if (after !== before) {
    fs.writeFileSync(filePath, after);
  }
}

const withAndroidCameraNativeLayer = (config) =>
  withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      patchFile(projectRoot, EXPO_CAMERA_VIEW, patchExpoCameraView);
      patchFile(projectRoot, EXPO_CAMERA_MODULE, patchCameraViewModule);
      return config;
    },
  ]);

module.exports = Object.assign(withAndroidCameraNativeLayer, {
  _patchExpoCameraView: patchExpoCameraView,
  _patchCameraViewModule: patchCameraViewModule,
});
