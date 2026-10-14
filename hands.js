const HANDS_VISION_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/+esm";
const HANDS_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const HANDS_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const INDEX_FINGER_TIP = 8;

const handsButton = document.getElementById("hands-button");
const handStatus = document.getElementById("hand-status");
const cameraFeed = document.getElementById("camera-feed");
const handLayer = document.getElementById("hand-layer");
const fingertip = document.getElementById("fingertip");

let trackingOn = false;
let starting = false;
let cameraStream = null;
let handLandmarker = null;
let loopId = 0;
let lastTimestamp = 0;
let tipSmooth = { x: 0, y: 0, ready: false };
let rippleWasActive = false;

handsButton.addEventListener("click", function () {
  if (trackingOn || starting) {
    stopHandTracking();
    return;
  }

  startHandTracking();
});

window.addEventListener("pagehide", function () {
  stopHandTracking();
});

function setHandStatus(message) {
  if (handStatus.textContent !== message) {
    handStatus.textContent = message;
  }
}

function setHandsButtonOn(isOn) {
  handsButton.classList.toggle("is-on", isOn);
  handsButton.setAttribute("aria-pressed", isOn ? "true" : "false");
}

async function startHandTracking() {
  if (starting || trackingOn) {
    return;
  }

  starting = true;
  setHandsButtonOn(true);
  setHandStatus("Requesting permission");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    starting = false;
    setHandsButtonOn(false);
    setHandStatus("Camera is not supported here");
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });
  } catch (error) {
    starting = false;
    setHandsButtonOn(false);
    setHandStatus(permissionMessage(error));
    return;
  }

  if (!starting) {
    stopCameraTracks();
    return;
  }

  cameraFeed.srcObject = cameraStream;
  await cameraFeed.play();

  try {
    if (!handLandmarker) {
      setHandStatus("Loading tracker");
      const vision = await import(HANDS_VISION_URL);
      const fileset = await vision.FilesetResolver.forVisionTasks(HANDS_WASM_URL);
      handLandmarker = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: HANDS_MODEL_URL
        },
        runningMode: "VIDEO",
        numHands: 1
      });
    }
  } catch (error) {
    starting = false;
    stopCameraTracks();
    setHandsButtonOn(false);
    setHandStatus("Hand tracker could not load");
    return;
  }

  if (!starting) {
    stopHandTracking();
    return;
  }

  trackingOn = true;
  starting = false;
  lastTimestamp = 0;
  setHandStatus("No hand detected");
  loopId = requestAnimationFrame(detectHands);
}

function stopHandTracking() {
  trackingOn = false;
  starting = false;

  if (loopId) {
    cancelAnimationFrame(loopId);
    loopId = 0;
  }

  stopCameraTracks();

  if (handLandmarker) {
    handLandmarker.close();
    handLandmarker = null;
  }

  fingertip.hidden = true;
  tipSmooth.ready = false;
  rippleWasActive = false;
  setHandsButtonOn(false);
  setHandStatus("Camera off");

  if (window.MozzaicRipple) {
    window.MozzaicRipple.clear();
  }
}

function stopCameraTracks() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(function (track) {
      track.stop();
    });
    cameraStream = null;
  }

  cameraFeed.srcObject = null;
}

function permissionMessage(error) {
  const name = error && error.name;

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission denied";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera found";
  }

  if (name === "NotReadableError") {
    return "Camera is unavailable";
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return "Camera is not supported here";
  }

  return "Camera could not start";
}

function detectHands(now) {
  if (!trackingOn || !handLandmarker) {
    return;
  }

  if (document.hidden || cameraFeed.readyState < 2) {
    loopId = requestAnimationFrame(detectHands);
    return;
  }

  if (now > lastTimestamp) {
    const result = handLandmarker.detectForVideo(cameraFeed, now);
    lastTimestamp = now;
    updateFingertip(result);
  }

  loopId = requestAnimationFrame(detectHands);
}

function updateFingertip(result) {
  const hands = result && result.landmarks;
  const hand = hands && hands[0];

  if (!hand || !hand[INDEX_FINGER_TIP]) {
    releaseRipplePointer();
    return;
  }

  const point = mapToArtwork(hand[INDEX_FINGER_TIP]);
  const inside =
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= handLayer.clientWidth &&
    point.y <= handLayer.clientHeight;

  if (!inside) {
    releaseRipplePointer();
    return;
  }

  if (!tipSmooth.ready) {
    tipSmooth.x = point.x;
    tipSmooth.y = point.y;
    tipSmooth.ready = true;
  } else {
    tipSmooth.x += (point.x - tipSmooth.x) * 0.22;
    tipSmooth.y += (point.y - tipSmooth.y) * 0.22;
  }

  fingertip.hidden = false;
  fingertip.style.left = tipSmooth.x + "px";
  fingertip.style.top = tipSmooth.y + "px";
  setHandStatus("Hand detected");
  rippleWasActive = true;
  if (window.MozzaicRipple) {
    window.MozzaicRipple.setPointer(point);
  }
}

function releaseRipplePointer() {
  fingertip.hidden = true;
  tipSmooth.ready = false;
  setHandStatus("No hand detected");
  if (rippleWasActive && window.MozzaicRipple) {
    window.MozzaicRipple.clear();
  }
  rippleWasActive = false;
}

window.MozzaicHands = {
  stop: stopHandTracking
};

function mapToArtwork(landmark) {
  const layerWidth = handLayer.clientWidth;
  const layerHeight = handLayer.clientHeight;
  const videoWidth = cameraFeed.videoWidth || 1;
  const videoHeight = cameraFeed.videoHeight || 1;

  // Front camera: flip X so moving right on screen follows the hand.
  const nx = 1 - landmark.x;
  const ny = landmark.y;

  const videoAspect = videoWidth / videoHeight;
  const layerAspect = layerWidth / layerHeight;

  let drawWidth;
  let drawHeight;
  let offsetX;
  let offsetY;

  if (videoAspect > layerAspect) {
    drawHeight = layerHeight;
    drawWidth = layerHeight * videoAspect;
    offsetX = (layerWidth - drawWidth) / 2;
    offsetY = 0;
  } else {
    drawWidth = layerWidth;
    drawHeight = layerWidth / videoAspect;
    offsetX = 0;
    offsetY = (layerHeight - drawHeight) / 2;
  }

  return {
    x: offsetX + nx * drawWidth,
    y: offsetY + ny * drawHeight
  };
}
