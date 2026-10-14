const imageInput = document.getElementById("image-input");
const generateButton = document.getElementById("generate-button");
const replayButton = document.getElementById("replay-button");
const resetButton = document.getElementById("reset-button");
const artwork = document.getElementById("artwork");
const status = document.getElementById("status");

// How many tiles across. Height is calculated from the image shape.
const TILES_ACROSS = 48;

let selectedImage = null;
let mosaicGeneration = 0;
let imageLoadId = 0;
let ambientTween = null;
let isBusy = false;
let currentTiles = [];
let currentCells = [];
let currentCols = 0;
let currentRows = 0;

let rippleTiles = [];
let rippleLoopId = 0;
let ripplePointer = null;
let rippleSmooth = { x: 0, y: 0, ready: false };
let rippleEuro = { x: 0, y: 0 };
let ripplePresence = 0;
let rippleTrail = [];
let rippleLastTrail = { x: 0, y: 0, ready: false };
let ripplePrevSmooth = { x: 0, y: 0, ready: false };
let rippleLastTick = 0;
let rippleActive = new Set();

imageInput.addEventListener("change", function (event) {
  const file = event.target.files[0];

  if (!file) {
    return;
  }

  if (!file.type || file.type.indexOf("image/") !== 0) {
    imageInput.value = "";
    setStatus("That file isn’t an image. Try a JPG or PNG.", true);
    return;
  }

  prepareImageFile(file);
});

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setStatus(message, isError) {
  status.textContent = message;
  status.classList.toggle("is-error", !!isError);
}

function setArtworkBusy(busy) {
  if (busy) {
    artwork.setAttribute("aria-busy", "true");
  } else {
    artwork.removeAttribute("aria-busy");
  }
}

generateButton.addEventListener("click", function () {
  if (isBusy || !selectedImage) {
    if (!selectedImage) {
      setStatus("Upload an image first", true);
    }
    return;
  }

  createMosaic(selectedImage);
});

replayButton.addEventListener("click", function () {
  if (isBusy || currentTiles.length === 0) {
    return;
  }

  replayReveal();
});

resetButton.addEventListener("click", function () {
  resetStudio();
});

function updateControls() {
  generateButton.disabled = isBusy || !selectedImage;
  replayButton.disabled = isBusy || currentTiles.length === 0;
}

function showStageMessage(message, busy) {
  artwork.classList.add("is-empty");
  artwork.classList.toggle("is-busy", busy);
  artwork.removeAttribute("style");
  artwork.innerHTML = "";
  currentCells = [];
  destroyRipple();

  const placeholder = document.createElement("p");
  placeholder.id = "placeholder";
  placeholder.className = "placeholder";
  placeholder.textContent = message;
  artwork.appendChild(placeholder);
}

function stopAllArtworkMotion() {
  mosaicGeneration += 1;

  if (ambientTween) {
    ambientTween.kill();
    ambientTween = null;
  }

  if (typeof gsap !== "undefined") {
    gsap.killTweensOf(artwork.querySelectorAll(".tile"));
  }
}

function prepareImageFile(file) {
  const loadId = ++imageLoadId;
  stopAllArtworkMotion();
  currentTiles = [];
  currentCells = [];
  currentCols = 0;
  currentRows = 0;
  isBusy = true;
  updateControls();

  imageInput.value = "";
  showStageMessage("Preparing image…", true);
  setStatus("Preparing image…");
  setArtworkBusy(true);

  const image = new Image();
  const objectUrl = URL.createObjectURL(file);

  image.onload = function () {
    URL.revokeObjectURL(objectUrl);
    if (loadId !== imageLoadId) {
      return;
    }

    selectedImage = image;
    isBusy = false;
    showStageMessage("Image ready · press Generate", false);
    setStatus("Image ready · press Generate");
    setArtworkBusy(false);
    updateControls();
  };

  image.onerror = function () {
    URL.revokeObjectURL(objectUrl);
    if (loadId !== imageLoadId) {
      return;
    }

    selectedImage = null;
    imageInput.value = "";
    isBusy = false;
    showStageMessage("Upload an image to begin", false);
    setStatus("Could not read that image. Try another file.", true);
    setArtworkBusy(false);
    updateControls();
  };

  image.src = objectUrl;
}

function createMosaic(image) {
  imageLoadId += 1;
  mosaicGeneration += 1;
  const generation = mosaicGeneration;
  isBusy = true;
  setArtworkBusy(true);
  updateControls();
  destroyRipple();

  if (ambientTween) {
    ambientTween.kill();
    ambientTween = null;
  }

  if (typeof gsap !== "undefined") {
    gsap.killTweensOf(artwork.querySelectorAll(".tile"));
  }

  const cols = TILES_ACROSS;
  const rows = Math.max(1, Math.round((image.height / image.width) * cols));

  // Draw the photo onto a tiny canvas. Each pixel becomes one tile color.
  const sampleCanvas = document.createElement("canvas");
  const sampleContext = sampleCanvas.getContext("2d");

  sampleCanvas.width = cols;
  sampleCanvas.height = rows;
  sampleContext.drawImage(image, 0, 0, cols, rows);

  const pixels = sampleContext.getImageData(0, 0, cols, rows).data;

  artwork.classList.remove("is-empty", "is-busy");
  artwork.innerHTML = "";
  artwork.style.gridTemplateColumns = "repeat(" + cols + ", 1fr)";
  artwork.style.aspectRatio = cols + " / " + rows;
  artwork.style.height = "auto";

  const tiles = [];
  const cells = [];

  for (let i = 0; i < cols * rows; i++) {
    const red = pixels[i * 4];
    const green = pixels[i * 4 + 1];
    const blue = pixels[i * 4 + 2];

    const cell = document.createElement("div");
    cell.className = "tile-cell";

    const tile = document.createElement("div");
    tile.className = "tile";
    tile.style.backgroundColor = "rgb(" + red + ", " + green + ", " + blue + ")";
    // Tiny surface differences, like handmade glaze. Color still comes from the image.
    tile.style.setProperty("--glaze", (0.1 + Math.random() * 0.12).toFixed(3));
    tile.style.setProperty("--shade", (0.06 + Math.random() * 0.08).toFixed(3));
    tile.style.setProperty("--fit", (96.5 + Math.random() * 3.5).toFixed(1) + "%");
    tile.style.setProperty("--radius", (1.4 + Math.random() * 1.3).toFixed(2) + "px");

    cell.appendChild(tile);
    artwork.appendChild(cell);
    cells.push(cell);
    tiles.push(tile);
  }

  currentTiles = tiles;
  currentCells = cells;
  currentCols = cols;
  currentRows = rows;
  prepareRipple();

  setStatus("Assembling " + tiles.length + " tiles");
  revealMosaic(tiles, cols, rows, generation);
}

function replayReveal() {
  mosaicGeneration += 1;
  const generation = mosaicGeneration;
  isBusy = true;
  setArtworkBusy(true);
  updateControls();
  resetRippleOffsets();

  if (ambientTween) {
    ambientTween.kill();
    ambientTween = null;
  }

  if (typeof gsap !== "undefined") {
    gsap.killTweensOf(currentTiles);
  }

  setStatus("Replaying " + currentTiles.length + " tiles");
  revealMosaic(currentTiles, currentCols, currentRows, generation);
}

function resetStudio() {
  imageLoadId += 1;
  stopAllArtworkMotion();
  selectedImage = null;
  currentTiles = [];
  currentCells = [];
  currentCols = 0;
  currentRows = 0;
  isBusy = false;
  imageInput.value = "";
  if (window.MozzaicHands) {
    window.MozzaicHands.stop();
  }
  showStageMessage("Upload an image to begin", false);
  setStatus("No image selected");
  setArtworkBusy(false);
  updateControls();
}

function revealMosaic(tiles, cols, rows, generation) {
  if (typeof gsap === "undefined") {
    isBusy = false;
    setArtworkBusy(false);
    setStatus(tiles.length + " tiles");
    updateControls();
    cacheRippleLayout();
    return;
  }

  if (prefersReducedMotion()) {
    gsap.set(tiles, {
      opacity: 1,
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      filter: "brightness(1)"
    });
    isBusy = false;
    setArtworkBusy(false);
    setStatus(tiles.length + " tiles");
    updateControls();
    cacheRippleLayout();
    return;
  }
  // Creating many tiles can freeze the page for a moment.
  // This stops GSAP from skipping the motion to "catch up".
  gsap.ticker.lagSmoothing(0);

  // Start each tile somewhere else, then let it settle into the grid.
  gsap.set(tiles, {
    opacity: 0,
    x: function () {
      return gsap.utils.random(-280, 280);
    },
    y: function () {
      return gsap.utils.random(-340, 160);
    },
    rotation: function () {
      return gsap.utils.random(-48, 48);
    },
    scale: function () {
      return gsap.utils.random(0.12, 0.85);
    },
    filter: "brightness(1)"
  });

  gsap.to(tiles, {
    opacity: 1,
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    duration: function () {
      return gsap.utils.random(1.35, 2.7);
    },
    delay: function () {
      return gsap.utils.random(0, 0.55);
    },
    ease: "power4.out",
    stagger: {
      amount: 3.1,
      from: "center",
      grid: [rows, cols],
      ease: "sine.inOut"
    },
    onComplete: function () {
      if (generation !== mosaicGeneration) {
        return;
      }

      gsap.set(tiles, { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 });
      setStatus(tiles.length + " tiles · living");
      isBusy = false;
      setArtworkBusy(false);
      updateControls();
      cacheRippleLayout();
      startLivingMosaic(tiles, cols, rows);
    }
  });
}

function startLivingMosaic(tiles, cols, rows) {
  if (typeof gsap === "undefined" || prefersReducedMotion()) {
    return;
  }

  if (ambientTween) {
    ambientTween.kill();
    ambientTween = null;
  }

  // One staggered tween, not a loop per tile.
  // Slow sine waves keep the mosaic readable and calm.
  ambientTween = gsap.to(tiles, {
    scale: function () {
      return gsap.utils.random(1.015, 1.05);
    },
    filter: function () {
      return "brightness(" + gsap.utils.random(1.02, 1.1) + ")";
    },
    duration: function () {
      return gsap.utils.random(2.8, 4.6);
    },
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
    stagger: {
      amount: 7.5,
      from: "center",
      grid: [rows, cols],
      ease: "sine.inOut"
    }
  });
}

function resetRippleOffsets() {
  ripplePointer = null;
  ripplePresence = 0;
  rippleTrail = [];
  rippleLastTrail.ready = false;
  ripplePrevSmooth.ready = false;
  rippleActive = new Set();

  rippleTiles.forEach(function (tile) {
    tile.ox = 0;
    tile.oy = 0;
    tile.rs = 1;
    tile.rr = 0;
    tile.el.style.removeProperty("--ox");
    tile.el.style.removeProperty("--oy");
    tile.el.style.removeProperty("--rs");
    tile.el.style.removeProperty("--rr");
    tile.el.style.removeProperty("--z");
  });
}

function prepareRipple() {
  ripplePointer = null;
  rippleSmooth.ready = false;
  ripplePresence = 0;
  rippleTrail = [];
  rippleLastTrail.ready = false;
  ripplePrevSmooth.ready = false;
  rippleLastTick = 0;
  rippleActive = new Set();
  cacheRippleLayout();
  requestAnimationFrame(cacheRippleLayout);
}

function cacheRippleLayout() {
  if (currentCells.length === 0 || currentCols === 0) {
    rippleTiles = [];
    return;
  }

  const styles = window.getComputedStyle(artwork);
  const padL = parseFloat(styles.paddingLeft) || 0;
  const padT = parseFloat(styles.paddingTop) || 0;
  const padR = parseFloat(styles.paddingRight) || 0;
  const padB = parseFloat(styles.paddingBottom) || 0;
  const borderL = parseFloat(styles.borderLeftWidth) || 0;
  const borderT = parseFloat(styles.borderTopWidth) || 0;
  const innerW = Math.max(artwork.clientWidth - padL - padR, 1);
  const innerH = Math.max(artwork.clientHeight - padT - padB, 1);
  const cellW = innerW / currentCols;
  const cellH = innerH / currentRows;
  const originX = borderL + padL;
  const originY = borderT + padT;

  rippleTiles = currentCells.map(function (el, index) {
    const col = index % currentCols;
    const row = Math.floor(index / currentCols);
    const previous = rippleTiles[index];

    return {
      el: el,
      restX: originX + (col + 0.5) * cellW,
      restY: originY + (row + 0.5) * cellH,
      ox: previous ? previous.ox : 0,
      oy: previous ? previous.oy : 0,
      rs: previous ? previous.rs : 1,
      rr: previous ? previous.rr : 0
    };
  });
}

function setRipplePointer(point) {
  if (!ripplePointer && point) {
    rippleEuro.x = point.x;
    rippleEuro.y = point.y;
    rippleSmooth.x = point.x;
    rippleSmooth.y = point.y;
    rippleSmooth.ready = true;
    rippleLastTrail.x = point.x;
    rippleLastTrail.y = point.y;
    rippleLastTrail.ready = true;
    ripplePrevSmooth.x = point.x;
    ripplePrevSmooth.y = point.y;
    ripplePrevSmooth.ready = true;
  }

  ripplePointer = point;
  ensureRippleLoop();
}

function clearRipplePointer() {
  if (!ripplePointer && ripplePresence === 0 && rippleTrail.length === 0) {
    return;
  }

  ripplePointer = null;
  ensureRippleLoop();
}

function destroyRipple() {
  if (rippleLoopId) {
    cancelAnimationFrame(rippleLoopId);
    rippleLoopId = 0;
  }

  ripplePointer = null;
  rippleSmooth.ready = false;
  ripplePresence = 0;
  rippleTrail = [];
  rippleLastTrail.ready = false;
  ripplePrevSmooth.ready = false;
  rippleLastTick = 0;
  rippleActive = new Set();
  rippleTiles = [];
}

function ensureRippleLoop() {
  if (rippleLoopId) {
    return;
  }

  rippleLoopId = requestAnimationFrame(stepRipple);
}

function filterAxis(previous, next, dt, minCutoff, beta) {
  const speed = Math.abs(next - previous) / Math.max(dt, 0.001);
  const cutoff = minCutoff + beta * speed;
  const alpha = 1 - Math.exp(-2 * Math.PI * cutoff * dt);
  return previous + alpha * (next - previous);
}

function rippleEnvelope(dist, radius, now, seed) {
  const t = Math.min(1, dist / radius);
  if (t >= 1) {
    return 0;
  }

  const envelope = (1 - t) * (1 - t) * (1 + t);
  const wave = 0.66 + 0.34 * Math.sin(dist * 0.08 - now * 0.0052 + seed);
  return envelope * wave;
}

function addRippleForce(tile, origin, amp, radius, now, seed, maxPush) {
  const dx = tile.restX - origin.x;
  const dy = tile.restY - origin.y;
  const dist = Math.sqrt(dx * dx + dy * dy) + 0.0001;
  const influence = rippleEnvelope(dist, radius, now, seed) * amp;

  if (influence <= 0) {
    return null;
  }

  const nx = dx / dist;
  const ny = dy / dist;
  const push = influence * maxPush;

  return {
    x: nx * push - ny * push * 0.12,
    y: ny * push + nx * push * 0.12,
    scale: influence * 0.08,
    rot: (nx - ny) * influence * 5.5,
    z: influence
  };
}

function markRippleNeighborhood(set, x, y, radius, layerWidth, layerHeight) {
  const styles = window.getComputedStyle(artwork);
  const padL = parseFloat(styles.paddingLeft) || 0;
  const padT = parseFloat(styles.paddingTop) || 0;
  const padR = parseFloat(styles.paddingRight) || 0;
  const padB = parseFloat(styles.paddingBottom) || 0;
  const borderL = parseFloat(styles.borderLeftWidth) || 0;
  const borderT = parseFloat(styles.borderTopWidth) || 0;
  const innerW = Math.max(artwork.clientWidth - padL - padR, 1);
  const innerH = Math.max(artwork.clientHeight - padT - padB, 1);
  const cellW = innerW / Math.max(currentCols, 1);
  const cellH = innerH / Math.max(currentRows, 1);
  const range = Math.ceil(radius / Math.max(Math.min(cellW, cellH), 1)) + 2;
  const gx = Math.floor((x - borderL - padL) / cellW);
  const gy = Math.floor((y - borderT - padT) / cellH);

  for (let row = gy - range; row <= gy + range; row += 1) {
    for (let col = gx - range; col <= gx + range; col += 1) {
      if (row < 0 || col < 0 || row >= currentRows || col >= currentCols) {
        continue;
      }

      set.add(row * currentCols + col);
    }
  }
}

function stepRipple(now) {
  rippleLoopId = 0;

  if (rippleTiles.length === 0) {
    return;
  }

  const layer = document.getElementById("hand-layer");
  const layerWidth = layer ? layer.clientWidth : artwork.clientWidth;
  const layerHeight = layer ? layer.clientHeight : artwork.clientHeight;
  const radius = Math.min(layerWidth, layerHeight) * 0.28;
  const maxPush = Math.min(layerWidth, layerHeight) * 0.05;
  const dt = rippleLastTick ? Math.min((now - rippleLastTick) / 1000, 0.05) : 0.016;
  rippleLastTick = now;

  const entering = ripplePointer && ripplePresence < 0.04;
  if (ripplePointer) {
    if (entering || !rippleSmooth.ready) {
      rippleEuro.x = ripplePointer.x;
      rippleEuro.y = ripplePointer.y;
      rippleSmooth.x = ripplePointer.x;
      rippleSmooth.y = ripplePointer.y;
      rippleSmooth.ready = true;
    } else {
      rippleEuro.x = filterAxis(rippleEuro.x, ripplePointer.x, dt, 1.15, 0.007);
      rippleEuro.y = filterAxis(rippleEuro.y, ripplePointer.y, dt, 1.15, 0.007);
      rippleSmooth.x = filterAxis(rippleSmooth.x, rippleEuro.x, dt, 0.9, 0.004);
      rippleSmooth.y = filterAxis(rippleSmooth.y, rippleEuro.y, dt, 0.9, 0.004);
    }
  }

  const targetPresence = ripplePointer ? 1 : 0;
  const presenceEase = ripplePointer ? 0.16 : 0.18;
  ripplePresence += (targetPresence - ripplePresence) * presenceEase;

  if (!ripplePointer && ripplePresence < 0.03) {
    ripplePresence = 0;
  }

  const px = rippleSmooth.x;
  const py = rippleSmooth.y;
  const speedPx = ripplePrevSmooth.ready
    ? Math.sqrt(
        (px - ripplePrevSmooth.x) * (px - ripplePrevSmooth.x) +
          (py - ripplePrevSmooth.y) * (py - ripplePrevSmooth.y)
      ) / Math.max(dt, 0.001)
    : 0;
  ripplePrevSmooth.x = px;
  ripplePrevSmooth.y = py;
  ripplePrevSmooth.ready = true;
  const speedNorm = Math.min(1, speedPx / Math.max(Math.min(layerWidth, layerHeight) * 1.8, 1));
  const speedAmp = 0.78 + 0.22 * (1 - speedNorm * speedNorm);

  if (ripplePointer && ripplePresence > 0.2) {
    const spacing = Math.min(layerWidth, layerHeight) * (0.045 + 0.02 * (1 - speedNorm));
    if (!rippleLastTrail.ready) {
      rippleLastTrail.x = px;
      rippleLastTrail.y = py;
      rippleLastTrail.ready = true;
    }

    const travel = Math.sqrt(
      (px - rippleLastTrail.x) * (px - rippleLastTrail.x) +
        (py - rippleLastTrail.y) * (py - rippleLastTrail.y)
    );

    if (travel >= spacing) {
      rippleTrail.push({
        x: px,
        y: py,
        born: now,
        life: 320 + speedNorm * 140,
        amp: 0.22 + 0.38 * speedNorm
      });
      if (rippleTrail.length > 8) {
        rippleTrail.shift();
      }
      rippleLastTrail.x = px;
      rippleLastTrail.y = py;
    }
  } else if (!ripplePointer) {
    rippleLastTrail.ready = false;
  }

  rippleTrail = rippleTrail.filter(function (drop) {
    return now - drop.born < drop.life;
  });

  const nextActive = new Set();
  const liveRipple = ripplePresence > 0.01 || rippleTrail.length > 0;

  if (liveRipple && rippleSmooth.ready) {
    markRippleNeighborhood(nextActive, px, py, radius, layerWidth, layerHeight);
    rippleTrail.forEach(function (drop) {
      markRippleNeighborhood(nextActive, drop.x, drop.y, radius * 0.85, layerWidth, layerHeight);
    });
  }

  rippleActive.forEach(function (index) {
    nextActive.add(index);
  });

  let stillMoving = false;

  nextActive.forEach(function (index) {
    const tile = rippleTiles[index];

    if (!tile) {
      return;
    }

    let forceX = 0;
    let forceY = 0;
    let forceScale = 0;
    let forceRot = 0;
    let forceZ = 0;

    if (liveRipple && rippleSmooth.ready) {
      if (ripplePointer && ripplePresence > 0) {
        const primary = addRippleForce(
          tile,
          { x: px, y: py },
          ripplePresence * speedAmp,
          radius,
          now,
          0,
          maxPush
        );

        if (primary) {
          forceX += primary.x;
          forceY += primary.y;
          forceScale += primary.scale;
          forceRot += primary.rot;
          forceZ += primary.z;
        }
      }

      rippleTrail.forEach(function (drop, dropIndex) {
        const age = (now - drop.born) / drop.life;
        const fade = (1 - age) * (1 - age);
        const ghost = addRippleForce(
          tile,
          drop,
          fade * drop.amp * ripplePresence,
          radius * 0.9,
          now,
          dropIndex * 0.7,
          maxPush
        );

        if (ghost) {
          forceX += ghost.x;
          forceY += ghost.y;
          forceScale += ghost.scale * 0.7;
          forceRot += ghost.rot * 0.7;
          forceZ += ghost.z * 0.7;
        }
      });
    }

    const mag = Math.sqrt(forceX * forceX + forceY * forceY);
    if (mag > maxPush) {
      forceX *= maxPush / mag;
      forceY *= maxPush / mag;
    }

    const targetX = forceX;
    const targetY = forceY;
    const targetScale = 1 + Math.min(forceScale, 0.12);
    const targetRot = Math.max(-8, Math.min(8, forceRot));
    const z = 1 + Math.round(Math.min(forceZ, 1) * 8);

    tile.ox += (targetX - tile.ox) * 0.18;
    tile.oy += (targetY - tile.oy) * 0.18;
    tile.rs += (targetScale - tile.rs) * 0.18;
    tile.rr += (targetRot - tile.rr) * 0.18;

    const settled =
      Math.abs(tile.ox) < 0.08 &&
      Math.abs(tile.oy) < 0.08 &&
      Math.abs(tile.rs - 1) < 0.003 &&
      Math.abs(tile.rr) < 0.06 &&
      Math.abs(targetX) < 0.08 &&
      Math.abs(targetY) < 0.08;

    if (settled) {
      tile.ox = 0;
      tile.oy = 0;
      tile.rs = 1;
      tile.rr = 0;
      tile.el.style.removeProperty("--ox");
      tile.el.style.removeProperty("--oy");
      tile.el.style.removeProperty("--rs");
      tile.el.style.removeProperty("--rr");
      tile.el.style.removeProperty("--z");
      return;
    }

    stillMoving = true;
    tile.el.style.setProperty("--ox", tile.ox.toFixed(2) + "px");
    tile.el.style.setProperty("--oy", tile.oy.toFixed(2) + "px");
    tile.el.style.setProperty("--rs", tile.rs.toFixed(3));
    tile.el.style.setProperty("--rr", tile.rr.toFixed(2) + "deg");
    tile.el.style.setProperty("--z", String(z));
  });

  rippleActive = new Set();
  nextActive.forEach(function (index) {
    const tile = rippleTiles[index];
    if (
      tile &&
      (Math.abs(tile.ox) > 0.08 || Math.abs(tile.oy) > 0.08 || liveRipple)
    ) {
      rippleActive.add(index);
    }
  });

  const settling = stillMoving || rippleTrail.length > 0 || ripplePresence > 0 || rippleActive.size > 0;

  if (settling) {
    ensureRippleLoop();
  }
}

window.MozzaicRipple = {
  setPointer: setRipplePointer,
  clear: clearRipplePointer,
  recache: cacheRippleLayout
};

window.addEventListener("resize", function () {
  cacheRippleLayout();
});

updateControls();
