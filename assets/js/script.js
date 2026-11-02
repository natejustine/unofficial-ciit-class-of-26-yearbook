const CONFIG = {
  aspectRatio: 4 / 5, 
  pageStiffness: 0.1, // 0 = soft, floppy, wide shadows, bouncy  ->  1 = stiff, crisp crease, snappy
  zoomLevel: 2.2, // magnification while the right mouse button is held
  phoneMaxWidth: 756, // narrower than this (px): one page at a time, camera pans across the spread
};

class FlipInstance {
  constructor() {
    // Define all properties once with default values
    this.active = false;
    this.direction = 0;
    this.cornerY = 0;
    this.corner = [0, 0];
    this.nearSpineCorner = [0, 0];
    this.farSpineCorner = [0, 0];
    this.position = [0, 0];
    this.velocity = [0, 0];
    this.target = [0, 0];
    this.mode = "peek";
    this.completes = false;
    this.isLifting = false;
    this.isLeaving = false;
    this.dragDistance = 0;
    this.isHardCover = false;
    this.grabPoint = null;
    this.pointerDown = null;
    this.fadingShadow = null;
    this.appearingShadow = null;
    this.isFast = false;
    this.holdCamera = false;
    this.finalSheets = 0;
  }

  reset(direction, cornerY, finalSheets, isHardCover) {
    this.active = true;
    this.direction = direction;
    this.cornerY = cornerY;
    this.corner = [spreadWidth, cornerY];
    this.nearSpineCorner = [pageWidth, cornerY];
    this.farSpineCorner = [pageWidth, pageHeight - cornerY];
    this.position = [spreadWidth, cornerY];
    this.velocity = [0, 0];
    this.target = [spreadWidth, cornerY];
    this.mode = "peek";
    this.completes = false;
    this.isLifting = false;
    this.isLeaving = false;
    this.dragDistance = 0;
    this.isHardCover = isHardCover;
    this.grabPoint = null;
    this.pointerDown = null;
    this.fadingShadow = null;
    this.appearingShadow = null;
    this.isFast = false;
    this.holdCamera = false;
    this.finalSheets = finalSheets;
  }
}

const flipInstance = new FlipInstance();

// interaction
const SWIPE_PAN_DISTANCE = 28; // px a phone swipe must travel to pan instead of flip
const TAP_MAX_MOVEMENT = 6; // px: less movement than this counts as a tap
const TAP_MAX_DURATION = 400; // ms
const FLICK_SPEED = 350; // px/s: a fast flick finishes (or cancels) the flip
const FINISH_THRESHOLD = 1.35; // letting go left of this many page widths finishes the flip
const LIFT_FRACTION = 0.18; // buttons/taps first lift the corner this fraction of the page height
const SKIP_SPEED = 15; // how much faster pages turn while skipToPage() runs
const CAST_SHADOW_ALPHA = 0.4; // darkness of the shadow a lifted page casts onto the pages below it

// elements and state
const byId = (id) => document.getElementById(id);
const byClass = (container, className) => container.querySelector(className);

const stage = byId("stage");
const zoomLayer = byId("zoom-layer");
const book = byId("book");
const leftSlot = byId("left-slot");
const rightSlot = byId("right-slot");
const shadowLeft = byId("shadow-left");
const shadowRight = byId("shadow-right");
const flipLayer = byId("flip-layer");
const frontLayer = byId("front-layer");
const flapLayer = byId("flap-layer");
const underShadowBox = byId("under-shadow");
const hardCover = byId("hard-cover");
const castGroup = byId("cast-group"); // flap + hard cover live here, so the lifted page casts a drop shadow
const flapShadeStrip = byClass(flapLayer, ".shade-strip");
const frontShadeStrip = byClass(frontLayer, ".shade-strip");
const underShadeStrip = byClass(underShadowBox, ".shade-strip");
const previousButton = byId("previous-button");
const nextButton = byId("next-button");
const pageLabel = byId("page-label");

const studentsPerPage = 6;
const minRotation = -3;
const maxRotation = 3;

let mousePosToBook = {x: 0, y:0};
let pageWidth = 0;
let pageHeight = 0;
let spreadWidth = 0;
let stripLength = 0;
let flippedSheets = 0; // sheets already turned over to the left side
let animationFrameId = 0;
let lastFrameTime = 0;
let lastPointer = null; // last pointer position (client coordinates) while dragging
let skipTarget = null; // set while skipToPage() is running: { sheets, view, resolve }
let skipTimer = 0;
let isPhoneLayout = false;
let phoneView = "right"; // phone only: which page of the spread the camera shows ('left' | 'right')
let isPanLocked = false; // phone only: ignore the rest of a gesture after it triggered a pan
let isZooming = false;

let sheetCount = 0;
let faceCount = 0;

let faces = null;

const cs = "aHR0cHM6Ly9kb2NzLmdvb2dsZS5jb20vc3ByZWFkc2hlZXRzL2QvZS8=";
const vu = "MlBBQ1gtMXZRNjRXbldZQXgtN2N0Vzg4Q1FhWENnS3BhV1NXNTBsa1VmbS1OVFhzaHd4Sm9UelJzSmFSaUNBMU5YSmZnQnhHa2RyNWxEd2tnaGFGM08v";
const rl = "cHViP291dHB1dD1jc3Y=";

const placeholders = [
  'placeholder.jpg'
];
const imageFrames = [
  'frame_1.png',
  'frame_2.png',
  'frame_3.png',
  'frame_4.png',
  'frame_5.png',
  'frame_6.png',
  'frame_7.png',
  'frame_8.png',
  'frame_9.png',
  'frame_10.png',
];

const tocPages = [];

// #region Loading CSV

async function loadSheetData() {
  try {
    const response = await fetch(atob(cs) + atob(vu) + atob(rl));
    const csvText = await response.text();
    
    //console.log(csvToJson(csvText));
    return csvToJson(csvText);
  } catch (error) {
    console.error("Error loading data:", error);
  }
}

function parseCSVLine(text) {
  const result = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      // handle escaped quotes ("") inside quotes
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++; // Skip the next quote
      } else {
        inQuotes = !inQuotes; // Toggle quote state
      }
    } else if (char === "," && !inQuotes) {
      // Comma outside quotes marks the end of a column value
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function csvToJson(csvString) {
  const rows = csvString.trim().split(/\r?\n/);
  if (rows.length === 0) return [];
  
  const headers = parseCSVLine(rows[0]);
  
  const jsonData = rows.slice(1).map((row) => {
    const values = parseCSVLine(row);
    
    return headers.reduce((obj, header, index) => {
      obj[header] = values[index] || "";
      return obj;
    }, {});
  });
  
  return jsonData;
}

// #endregion

// #region Helpers

function convertDriveLinkToEmbed(input) {
  if (!input || typeof input !== "string") return false;
  
  // regex to extract the file ID from various Google Drive URL patterns:
  // - /file/d/FILE_ID/view...
  // - /uc?id=FILE_ID or &id=FILE_ID
  // - /open?id=FILE_ID
  const driveRegex =
    /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=|[^\/]+\/[^\/]+\/d\/)([a-zA-Z0-9_-]{25,}))|(?:id=([a-zA-Z0-9_-]{25,}))/;

  const match = input.trim().match(driveRegex);

  // match[1] captures the ID from standard paths, match[2] captures from query parameters if needed
  const fileId = match ? match[1] || match[2] : null;

  if (!fileId) {
    // fallback: If the input itself is just a bare file ID string (25+ alphanumeric/dash/underscore chars)
    const bareIdRegex = /^[a-zA-Z0-9_-]{25,}$/;
    if (bareIdRegex.test(input.trim())) {
      return `https://drive.google.com/uc?export=view&id=${input.trim()}`;
    }
    return input; //fail
  }

  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

function getRandomPlaceholder(){
  const randomIndex = Math.floor(Math.random() * placeholders.length);
  const randomItem = placeholders[randomIndex];
  
  return `./assets/img/placeholders/${randomItem}`;
}

function getRandomImageFrame(){
  const randomIndex = Math.floor(Math.random() * imageFrames.length);
  const randomItem = imageFrames[randomIndex];
  
  return `./assets/img/frames/${randomItem}`;
}

function getRandomRotation(){
    return (Math.random() * (maxRotation - minRotation) + minRotation).toFixed(2);
};

function openPortfolio(url) {
    if (!url) return;
    let trimmedUrl = url.trim();
    
    // Check if it already has http:// or https://, if not, prepend https://
    if (!/^https?:\/\//i.test(trimmedUrl)) {
        trimmedUrl = 'https://' + trimmedUrl;
    }
    
    window.open(trimmedUrl, '_blank');
}

// #endregion

function createFace(faceIndex, bookPages) {
  const pageData = bookPages[faceIndex];
  const face = document.createElement("div");
  face.className = "page " + (faceIndex % 2 ? "page-left" : "page-right");
  if (pageData.cover) face.classList.add("hard-cover-page");
  if (pageData.className) face.classList.add(...pageData.className.split(" "));
  face.innerHTML = pageData.html;
  return face;
}

function fillSlot(slot, face) {
  slot.textContent = "";
  if (face) slot.appendChild(face.cloneNode(true));
}

function fillLayerContent(layer, face, isMirrored) {
  const content = layer.querySelector(".layer-content");
  content.textContent = "";
  content.appendChild(face.cloneNode(true));
  content.style.transform = isMirrored ? "scaleX(-1)" : "";
}

// keeps the part of a polygon on one side of a line (side = +1 or -1). used to cut the page along the fold.
function clipPolygonToHalfPlane(polygon, normalX, normalY, pointX, pointY, side) {
  const clipped = [];

  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const currentDistance = side * ((current[0] - pointX) * normalX + (current[1] - pointY) * normalY);
    const nextDistance = side * ((next[0] - pointX) * normalX + (next[1] - pointY) * normalY);

    if (currentDistance >= 0) clipped.push(current);

    if (currentDistance >= 0 !== nextDistance >= 0) {
      const ratio = currentDistance / (currentDistance - nextDistance);
      clipped.push([
        current[0] + (next[0] - current[0]) * ratio,
        current[1] + (next[1] - current[1]) * ratio,
      ]);
    }
  }

  return clipped;
}

function applyClipPolygon(element, polygon) {
  // https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/clip-path
  const cssValue =
    polygon.length > 2
      ? "polygon(" +
        polygon
          .map(
            (point) => point[0].toFixed(1) + "px " + point[1].toFixed(1) + "px",
          )
          .join(",") +
        ")"
      : "polygon(0 0,0 0,0 0)";
  element.style.clipPath = cssValue;
  element.style.webkitClipPath = cssValue;
}

// paper can't stretch: keep the lifted corner within reach of the two spine corners.
function limitFoldPoint(point, flip) {
  let [pointX, pointY] = point;

  let offsetX = pointX - flip.nearSpineCorner[0];
  let offsetY = pointY - flip.nearSpineCorner[1];

  let distance = Math.hypot(offsetX, offsetY);

  if (distance > pageWidth) {
    pointX = flip.nearSpineCorner[0] + (offsetX / distance) * pageWidth;
    pointY = flip.nearSpineCorner[1] + (offsetY / distance) * pageWidth;
  }

  const diagonal = Math.hypot(pageWidth, pageHeight);

  offsetX = pointX - flip.farSpineCorner[0];
  offsetY = pointY - flip.farSpineCorner[1];

  distance = Math.hypot(offsetX, offsetY);

  if (distance > diagonal) {
    pointX = flip.farSpineCorner[0] + (offsetX / distance) * diagonal;
    pointY = flip.farSpineCorner[1] + (offsetY / distance) * diagonal;
  }

  return [Math.min(pointX, spreadWidth - 0.5), pointY];
}

function renderStaticPages() {
  const hasLeftPage = flippedSheets > 0;
  const hasRightPage = flippedSheets < sheetCount;
  fillSlot(leftSlot, hasLeftPage ? faces[2 * flippedSheets - 1] : null);
  fillSlot(rightSlot, hasRightPage ? faces[2 * flippedSheets] : null);
  // one shadow per page, each clipped at the spine; they only fade in/out, never resize
  if (shadowLeft != null) shadowLeft.style.opacity = hasLeftPage ? "1" : "0";
  if (shadowRight != null) shadowRight.style.opacity = hasRightPage ? "1" : "0";
}

function restingCameraOffset(sheets, view) {
  if (isPhoneLayout) {
    const shownView = sheets === 0 ? "right" : sheets === sheetCount ? "left" : view;
    return shownView === "left" ? pageWidth / 2 : -pageWidth / 2;
  }

  if (sheets === 0) return -pageWidth / 2;
  if (sheets === sheetCount) return pageWidth / 2;
  return 0;
}

function positionCamera() {
  if (flippedSheets === 0){
    phoneView = "right";
  } else if (flippedSheets === sheetCount){
    phoneView = "left";
  }

  const offset = restingCameraOffset(flippedSheets, phoneView);

  if (book != null) book.style.transform = `translateX(${offset}px)`;
}

function syncCameraToFlip(flip) {
  
  if(book == null) return;

  if (flip.mode === "peek" || flip.holdCamera) return; // hovering, or skipping on a phone, keeps the camera still

  const progress = Math.max(
    0,
    Math.min(1, (spreadWidth - flip.position[0]) / spreadWidth),
  );
  
  const startOffset = restingCameraOffset(flippedSheets, phoneView);

  const endOffset = restingCameraOffset(
    flip.finalSheets,
    flip.direction > 0 ? "left" : "right",
  );

  const offset = startOffset + (endOffset - startOffset) * progress;
  book.style.transform = `translateX(${offset}px)`;
}

function setPhoneView(view) {
  if (flipInstance.active) return;

  phoneView = view;
  positionCamera();
  updateControls();
}

function updateControls() {
  if(pageLabel == null) return;
  if(previousButton == null) return;
  if(nextButton == null) return;
  
  const visibleFaceIndex = phoneView === "left" ? 2 * flippedSheets - 1 : 2 * flippedSheets;

  if (isPhoneLayout) {
    if (visibleFaceIndex === 0) {
      pageLabel.textContent = "Cover";
    } else if (visibleFaceIndex === faceCount - 1) {
      pageLabel.textContent = "Back cover";
    } else {
      pageLabel.textContent = `Page ${visibleFaceIndex}`;
    }
  } else if (flippedSheets === 0) {
    pageLabel.textContent = "Cover";
  } else if (flippedSheets === sheetCount) {
    pageLabel.textContent = "Back cover";
  } else {
    pageLabel.textContent = `Pages ${2 * flippedSheets - 1}-${2 * flippedSheets}`;
  }

  previousButton.disabled = isPhoneLayout
    ? phoneView === "right" && flippedSheets <= 0
    : flippedSheets <= 0;
  nextButton.disabled = isPhoneLayout
    ? phoneView === "left" && flippedSheets >= sheetCount
    : flippedSheets >= sheetCount;
}

function layoutBook() {
  if (stage == null) return;
  if (zoomLayer == null) return;
  if (book == null) return;

  if (flipInstance.active) finishFlip(false);

  const stageWidth = stage.clientWidth;
  const stageHeight = stage.clientHeight;
  const aspect = CONFIG.aspectRatio;

  isPhoneLayout = stageWidth < CONFIG.phoneMaxWidth;
  pageWidth = isPhoneLayout
    ? Math.min(stageWidth * 0.9, stageHeight * 0.9 * aspect)
    : Math.min((stageWidth * 0.94) / 2.5, stageHeight * 0.9 * aspect);
  pageHeight = pageWidth / aspect;
  spreadWidth = pageWidth * 2;
  stripLength = 3 * Math.hypot(spreadWidth, pageHeight);
  

  book.style.setProperty("--page-width", pageWidth + "px");
  book.style.setProperty("--page-height", pageHeight + "px");
  book.style.transition = "none";
  renderStaticPages();
  positionCamera();
  book.offsetWidth; // force a reflow so the camera jumps instead of animating
  book.style.transition = "";
  updateControls();
}

// ============================================================
// Starting and finishing a flip
// ============================================================
// direction: +1 = turn a page from right to left, -1 = turn it back. cornerY: 0 (top) or pageHeight (bottom).
function startFlip(direction, cornerY, faceOverrides = {}) {
  if (book == null) return;
  if (flipLayer == null) return;
  if (frontLayer == null) return;
  if (castGroup == null) return;
  if (flapLayer == null) return;
  if (hardCover == null) return;
  if (underShadowBox == null) return;

  const sheetIndex = direction > 0 ? flippedSheets : flippedSheets - 1;
  const frontFace = faceOverrides.frontFace || faces[2 * sheetIndex];
  const backFace = faceOverrides.backFace || faces[2 * sheetIndex + 1];
  
  const defaultRevealedFace =
    direction > 0
      ? faces[2 * (flippedSheets + 1)]
      : faces[2 * (flippedSheets - 2) + 1];
  const revealedFace =
    "revealedFace" in faceOverrides
      ? faceOverrides.revealedFace
      : defaultRevealedFace;
  const revealedRightFace = direction > 0 ? revealedFace : undefined;
  const revealedLeftFace = direction > 0 ? undefined : revealedFace;
 
  if (direction > 0) {
    fillSlot(rightSlot, revealedRightFace || null);
  } else {
    fillSlot(leftSlot, revealedLeftFace || null);
  }
  
  // covers are rigid boards: they swing on the spine instead of curling
  const isHardCover = sheetIndex === 0 || sheetIndex === sheetCount - 1;

  // backward flips reuse the forward geometry, mirrored
  flipLayer.style.transform = direction > 0 || isHardCover ? "" : `matrix(-1,0,0,1,${spreadWidth},0)`;
  castGroup.style.perspective = isHardCover ? 3 * pageWidth + "px" : "";
  frontLayer.style.display = flapLayer.style.display = isHardCover
    ? "none"
    : "block";
  hardCover.style.display = isHardCover ? "block" : "none";
  underShadowBox.style.left = isHardCover && direction < 0 ? "0" : "";

  if (isHardCover) {
    const visibleFace = direction > 0 ? frontFace : backFace;
    const hiddenFace = direction > 0 ? backFace : frontFace;

    hardCover.style.left = direction > 0 ? "var(--page-width)" : "0";
    hardCover.style.transformOrigin = direction > 0 ? "0 50%" : "100% 50%";
    hardCover.style.transform = "";

    const coverSides = [
      [hardCover.firstElementChild, visibleFace],
      [hardCover.lastElementChild, hiddenFace],
    ];

    for (const [sideElement, face] of coverSides) {
      sideElement.textContent = "";
      sideElement.appendChild(face.cloneNode(true));
      sideElement.insertAdjacentHTML(
        "beforeend",
        '<i class="cover-dimmer"></i>',
      );
    }

  } else {
    fillLayerContent(frontLayer, direction > 0 ? frontFace : backFace, direction < 0);
    fillLayerContent(flapLayer, direction > 0 ? backFace : frontFace, direction > 0);
  }

  // Everything below is in "forward" coordinates: the page being turned lies in the right slot.
  flipInstance.reset(
      direction, 
      cornerY, 
      faceOverrides.finalSheets ?? flippedSheets + direction, 
      isHardCover
    );

  flipLayer.style.display = "block";
  book.style.transition = "none"; // the camera follows the flip frame by frame instead of animating

  // if no page is revealed underneath (first/last cover), fade that side's outer shadow out as the page lifts
  flipInstance.fadingShadow =
    direction > 0
      ? revealedRightFace
        ? null
        : shadowRight
      : revealedLeftFace
        ? null
        : shadowLeft;

  if (flipInstance.fadingShadow) flipInstance.fadingShadow.style.transition = "none";
  
  // opening the first cover / closing the back cover: the side the page lands on has no shadow yet,
  // so grow it while the page travels instead of fading it in after it has landed
  const landsOnEmptySide = direction > 0 ? flippedSheets === 0 : flippedSheets === sheetCount;

  if (landsOnEmptySide) {
    flipInstance.appearingShadow = direction > 0 ? shadowLeft : shadowRight;
    flipInstance.appearingShadow.style.transition = "none";
  }

  drawFlip(flipInstance);
  requestFrame();
}

function finishFlip(completed) {
  if (book == null) return;
  if (flipLayer == null) return;
  if (hardCover == null) return;
  if (shadowLeft == null) return;
  if (shadowRight == null) return;
  
  flipInstance.active = false;

  flipLayer.style.display = "none";
  hardCover.style.display = "none";
  shadowLeft.style.transition = shadowRight.style.transition = "none";
  book.style.transition = ""; // camera animates normally again

  if (completed) {
    flippedSheets = flipInstance.finalSheets;
    if (!flipInstance.holdCamera) phoneView = flipInstance.direction > 0 ? "left" : "right"; // phone camera follows the page to where it landed
  }
  renderStaticPages(); // sets the final shadow opacities
  for (const shadow of [shadowLeft, shadowRight]) {
    shadow.style.clipPath = shadow.style.webkitClipPath = ""; // back to the stylesheet clip
  }
  shadowLeft.offsetWidth; // apply the above instantly, then allow fades again
  shadowLeft.style.transition = shadowRight.style.transition = "";

  positionCamera();
  updateControls();
  if (skipTarget) requestAnimationFrame(continueSkip);
}

function requestFrame() {
  if (!animationFrameId) {
    lastFrameTime = performance.now();
    animationFrameId = requestAnimationFrame(animationFrame);
  }
}

function stepSpring(flip, axis, springStrength, damping, timeStep) {
  const force = springStrength * (flip.target[axis] - flip.position[axis]) - damping * flip.velocity[axis];
  flip.velocity[axis] += force * timeStep;
  flip.position[axis] += flip.velocity[axis] * timeStep;
}

function animationFrame(timestamp) {
  animationFrameId = 0;

  if (!flipInstance.active) return;
  
  const elapsedSeconds = Math.min(
    (timestamp - lastFrameTime) / 1000 || 0.016,
    0.033,
  );
  lastFrameTime = timestamp;

  // the camera moves while dragging, so re-aim at the finger every frame
  if (flipInstance.mode === "drag" && lastPointer) {
    flipInstance.target = computeTarget(flipInstance, mousePosToBook.x, mousePosToBook.y);
  }

  const stiffness = CONFIG.pageStiffness;
  const isDragging = flipInstance.mode === "drag";
  let springStrength = 120 + 1400 * stiffness * stiffness;
  if (isDragging) springStrength *= 3;
  if (flipInstance.isFast) springStrength *= SKIP_SPEED;
  const isReturningToCorner =
    flipInstance.mode === "peek" || (flipInstance.mode === "anim" && !flipInstance.completes);
  const dampingRatio = isDragging
    ? 0.9
    : flipInstance.isFast
      ? 1
      : isReturningToCorner
        ? 1.1
        : 0.45 + 0.55 * stiffness;
  
  const damping = 2 * Math.sqrt(springStrength) * dampingRatio;
  const timeStep = elapsedSeconds / 3;

  for (let subStep = 0; subStep < 3; subStep++) {
    for (let axis = 0; axis < 2; axis++) {
      stepSpring(flipInstance, axis, springStrength, damping, timeStep);
    }
  }
  
  if (isReturningToCorner) {
    // never overshoot past the corner: that would flip the fold direction and look like a flick
    if (flipInstance.position[0] > spreadWidth - 0.5) {
      flipInstance.position[0] = spreadWidth - 0.5;

      if (flipInstance.velocity[0] > 0) flipInstance.velocity[0] = 0;
    }

    const passedCornerEdge = flipInstance.cornerY ? flipInstance.position[1] > pageHeight : flipInstance.position[1] < 0;

    if (passedCornerEdge) {
      flipInstance.position[1] = flipInstance.cornerY;
      const movingOutward = flipInstance.cornerY
        ? flipInstance.velocity[1] > 0
        : flipInstance.velocity[1] < 0;
      if (movingOutward) flipInstance.velocity[1] = 0;
    }
  }

  if (flipInstance.isLifting && flipInstance.position[0] < pageWidth * 1.15) {
    flipInstance.target = [0, flipInstance.cornerY];
    flipInstance.isLifting = false;
  }

  drawFlip(flipInstance);

  if (!isDragging) {
    const distanceToTarget = Math.hypot(
      flipInstance.position[0] - flipInstance.target[0],
      flipInstance.position[1] - flipInstance.target[1],
    );

    const speed = Math.hypot(flipInstance.velocity[0], flipInstance.velocity[1]);
    if (distanceToTarget < 0.8 && speed < 8 && !flipInstance.isLifting) {
      if (flipInstance.mode === "anim") {
        finishFlip(flipInstance.completes);
        return;
      }
      if (flipInstance.isLeaving) {
        finishFlip(false);
        return;
      }
    }
  }
  animationFrameId = requestAnimationFrame(animationFrame);
}
// #region fold
function clipShadowToCover(shadow, side, reach) {
  const hiddenWidth = (1 - reach) * pageWidth - 80 * Math.pow(reach, 4); // -80 = the normal, unclipped shadow

  const clipValue =
    side === "left"
      ? `inset(-80px 0 -80px ${hiddenWidth}px)`
      : `inset(-80px ${hiddenWidth}px -80px 0)`;

  shadow.style.clipPath = shadow.style.webkitClipPath = clipValue;
  shadow.style.opacity = 1;
}

function updateCoverShadows(flip) {
  const edgeX = flip.position[0] > spreadWidth - 1 ? spreadWidth : flip.position[0];
  const swing = Math.max(-1, Math.min(1, (edgeX - pageWidth) / pageWidth)); // 1 = closed where it started, -1 = landed
  const startSide = flip.direction > 0 ? "right" : "left";
  const landSide = flip.direction > 0 ? "left" : "right";

  if (flip.fadingShadow) {
    clipShadowToCover(flip.fadingShadow, startSide, Math.max(0, swing));
  }

  if (flip.appearingShadow) {
    clipShadowToCover(flip.appearingShadow, landSide, Math.max(0, -swing));
  }
}

function drawFlip(flip) {
  if (flip.isHardCover){
    drawHardCover(flip);
  } else {
    drawCurl(flip);
  }

  if (flip.isHardCover){
    updateCoverShadows(flip);
  }

  syncCameraToFlip(flip);
}

// The fold line is the perpendicular bisector between the page corner and the lifted corner.
// The part of the page beyond it is mirrored across the line to form the flap.
function drawCurl(flip) {
  if(castGroup == null) return;
  if(flapLayer == null) return;
  
  flip.position = limitFoldPoint(flip.position, flip);
  
  // fold distance
  const corner = flip.corner;
  const [liftedX, liftedY] = flip.position;
  const deltaX = corner[0] - liftedX;
  const deltaY = corner[1] - liftedY;
  //const foldDistance = Math.hypot(deltaX, deltaY); // just the same below
  const foldDistance = Math.sqrt((deltaX * deltaX) + (deltaY * deltaY));
  
  const pageRectangle = [
    [pageWidth, 0],
    [spreadWidth, 0],
    [spreadWidth, pageHeight],
    [pageWidth, pageHeight],
  ];

  if (foldDistance < 0.5) {
    castGroup.style.setProperty("--cast-alpha", '0');
    applyClipPolygon(frontLayer, pageRectangle);
    applyClipPolygon(flapLayer, []);
    return;
  }
  
  // perpendicular bisector
  const normalX = deltaX / foldDistance;
  const normalY = deltaY / foldDistance;
  const midpointX = (corner[0] + liftedX) / 2;
  const midpointY = (corner[1] + liftedY) / 2;
  
  const frontLayerHalfPolygon = clipPolygonToHalfPlane(
    pageRectangle,
    normalX,
    normalY,
    midpointX,
    midpointY,
    -1,);

  applyClipPolygon(
    frontLayer,
    frontLayerHalfPolygon
  );

  const flapLayerHalfPolygon = clipPolygonToHalfPlane(
    pageRectangle,
    normalX,
    normalY,
    midpointX,
    midpointY,
    1)
  
  applyClipPolygon(
    flapLayer,
    flapLayerHalfPolygon
  );

  // reflection matrix across the fold line
  const crossTerm = -2 * normalX * normalY;
  const translation = 2 * (midpointX * normalX + midpointY * normalY);

  flapLayer.style.transform = `matrix(${1 - 2 * normalX * normalX},${crossTerm},${crossTerm},${1 - 2 * normalY * normalY},${translation * normalX},${translation * normalY})`;

  // shading: softer paper = wider, gentler shadows; fades in at the start and out when nearly open
  const foldAngle = Math.atan2(normalY, normalX);
  // the lifted page casts a shadow onto what lies below it (left page, front page); it only fades at the very end
  const castAlpha =
    CAST_SHADOW_ALPHA *
    Math.min(1, foldDistance / (pageWidth * 0.1)) *
    Math.min(1, (spreadWidth - foldDistance) / (pageWidth * 0.12));

  castGroup.style.setProperty("--cast-alpha", castAlpha.toString());

  const shadeWidth = ((36 + 200 * (1 - CONFIG.pageStiffness)) * pageHeight) / 800;
  const shadeOpacity =
    Math.min(1, foldDistance / (pageWidth * 0.25)) *
    Math.max(0, Math.min(1, (spreadWidth - foldDistance) / (pageWidth * 0.15)));
  const visibleDepth = foldDistance / 2 + 2;

  function placeShadeStrip(strip, originX, originY, width, shiftAlongNormal) {
    strip.style.opacity = shadeOpacity;
    strip.style.width = width + "px";
    strip.style.height = stripLength + "px";
    strip.style.transform = `translate(${originX}px,${originY}px) rotate(${foldAngle}rad) translate(${shiftAlongNormal}px,-50%)`;
  }

  placeShadeStrip(
    flapShadeStrip,
    midpointX,
    midpointY,
    Math.min(shadeWidth, visibleDepth),
    0,
  );

  placeShadeStrip(
    frontShadeStrip,
    midpointX,
    midpointY,
    shadeWidth * 0.8,
    -shadeWidth * 0.8,
  );
  
  placeShadeStrip(
    underShadeStrip,
    midpointX - pageWidth,
    midpointY,
    Math.min(shadeWidth * 2.2, visibleDepth),
    0,
  );

}

//#endregion

// hard cover: rotates around the spine so its free edge follows the pointer's x position.
function drawHardCover(flip) {
  if (castGroup == null) return;
  if (hardCover == null) return;
  if (underShadeStrip == null) return;

  flip.position = limitFoldPoint(flip.position, flip);
  const edgeX = flip.position[0] > spreadWidth - 1 ? spreadWidth : flip.position[0];
  const angle = Math.acos( Math.max(-1, Math.min(1, (edgeX - pageWidth) / pageWidth)));
  const sine = Math.sin(angle);
  const shadowAlpha = CAST_SHADOW_ALPHA * Math.min(1, sine * 4);

  castGroup.style.setProperty("--cast-alpha", shadowAlpha.toString());

  const degrees = (angle * 180) / Math.PI;
  
  hardCover.style.transform = `rotateY(${flip.direction > 0 ? -degrees : degrees}deg)`;

  hardCover.querySelectorAll(".cover-dimmer").forEach((dimmer) => {
    dimmer.style.opacity = 0.18 * sine;
  });

  // soft shadow cast on the page below, starting at the cover's free edge (not a flat tint)
  const shadowStart =
    flip.direction > 0
      ? Math.max(0, pageWidth * Math.cos(angle))
      : Math.min(pageWidth, pageWidth - pageWidth * Math.cos(angle));
  
  underShadeStrip.style.opacity = Math.min(1, sine * 1.4).toString();
  underShadeStrip.style.width = pageWidth * 0.45 + "px";
  underShadeStrip.style.height = pageHeight + "px";
  underShadeStrip.style.transform = `translate(${shadowStart}px,${pageHeight / 2}px) rotate(${flip.direction > 0 ? 0 : Math.PI}rad) translate(0,-50%)`;
}

//#region pointer

function pointerToBookCoords(event){
  if(book == null) return {x: 0, y:0};

  const bounds = book.getBoundingClientRect();
  const scale = bounds.width / spreadWidth || 1; // book is scaled while zooming
  return {
    x: (event.clientX - bounds.left) / scale,
    y: (event.clientY - bounds.top) / scale
  }
}

// The grabbed point follows the pointer: the fold is the perpendicular bisector of the grab point and the
// pointer, and the lifted corner is the page corner mirrored across it. Grab a side and pull straight = straight
// fold; grab a corner = diagonal curl. Nothing snaps to the cursor.
function computeTarget(flip, pointerX, pointerY) {
  const forwardX = flip.direction > 0 ? pointerX : spreadWidth - pointerX; // backward flips are mirrored
  const grab = flip.grabPoint;

  if (flip.isHardCover) {
    const swing = Math.max(
      -1,
      Math.min(1, (forwardX - pageWidth) / Math.max(grab[0] - pageWidth, 8)),
    );
    return [pageWidth + pageWidth * swing, flip.cornerY];
  }

  const pullX = grab[0] - forwardX;
  let pullY = pointerY - grab[1];
  if (pullX < 0.5) return flip.corner.slice();
  pullY = Math.max(-2.5 * pullX, Math.min(2.5 * pullX, pullY));

  const pullLength = Math.hypot(pullX, pullY);
  const normalX = pullX / pullLength;
  const normalY = -pullY / pullLength;
  const midpointX = grab[0] - pullX / 2;
  const midpointY = grab[1] + pullY / 2;
  const reflection =
    2 *
    ((flip.corner[0] - midpointX) * normalX +
      (flip.corner[1] - midpointY) * normalY);

  return limitFoldPoint(
    [
      flip.corner[0] - reflection * normalX,
      flip.corner[1] - reflection * normalY,
    ],
    flip,
  );
}

// Hovering near an outer corner with a mouse makes the page peel slightly.
function findHoverCorner(pointerX, pointerY) {
  const zone = pageWidth * 0.15;
  let direction = 0;
  if (
    pointerX > spreadWidth - zone &&
    pointerX <= spreadWidth + 10 &&
    flippedSheets < sheetCount &&
    (!isPhoneLayout || phoneView === "right")
  ) {
    direction = 1;
  } else if (
    pointerX < zone &&
    pointerX >= -10 &&
    flippedSheets > 0 &&
    (!isPhoneLayout || phoneView === "left")
  ) {
    direction = -1;
  }

  const nearTopOrBottom = pointerY < zone || pointerY > pageHeight - zone;

  if (!direction || !nearTopOrBottom || pointerY < -10 || pointerY > pageHeight + 10) return null;

  return {
    direction,
    cornerY: pointerY < pageHeight / 2 ? 0 : pageHeight,
  };
}

function handlePointerDown(event) {
  
  if (stage == null) return;

  mousePosToBook = pointerToBookCoords(event);

  if (event.button === 2) {
    startZoom(event);
    return;
  }

  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (event.target.closest(".student-link")) return;
  if (event.target.closest(".toc-button")) return;

  cancelSkip(false); 
  
  const isRightView = phoneView === "right";
  const minX = isPhoneLayout && isRightView ? pageWidth : 0;
  const maxX = isPhoneLayout && !isRightView ? pageWidth : spreadWidth;

  if ( mousePosToBook.x < minX || mousePosToBook.x > maxX || mousePosToBook.y < 0 || mousePosToBook.y > pageHeight) return;
  isPanLocked = false;

  // phone: the right page flips forward, the left page flips backward; the other page is reached by panning
  const direction = isPhoneLayout
    ? isRightView
      ? 1
      : -1
    : mousePosToBook.x >= pageWidth
      ? 1
      : -1;

  if (direction > 0 ? flippedSheets >= sheetCount : flippedSheets <= 0) return;
  if (flipInstance.active && flipInstance.mode === "anim") return;

  const cornerY = mousePosToBook.y < pageHeight / 2 ? 0 : pageHeight;
  
  if (flipInstance.active && (flipInstance.direction !== direction || flipInstance.cornerY !== cornerY)) finishFlip(false);

  if (!flipInstance.active) startFlip(direction, cornerY);
  
  flipInstance.mode = "drag";

  flipInstance.grabPoint = [
    direction > 0 ? mousePosToBook.x : spreadWidth - mousePosToBook.x,
    mousePosToBook.y,
  ];

  flipInstance.pointerDown = {
    x: mousePosToBook.x,
    y: mousePosToBook.y,
    clientX: event.clientX,
    clientY: event.clientY,
    time: performance.now(),
  };

  lastPointer = { clientX: event.clientX, clientY: event.clientY };

  flipInstance.dragDistance = 0;
  flipInstance.isLeaving = false;
  flipInstance.target = computeTarget(flipInstance, mousePosToBook.x, mousePosToBook.y);

  try {
    stage.setPointerCapture(event.pointerId);
  } catch (error) {
    
  }

  stage.style.cursor = "none"; // hide the cursor while holding a page
  requestFrame();
}

function handlePointerMove(event) {
  
  if (isZooming) {
    moveZoom(event);
    return;
  }

  if (isPanLocked) return;

  mousePosToBook = pointerToBookCoords(event);
  
  // phone: swiping away from the flip direction pans to the other page of the spread
  if (flipInstance.active && flipInstance.mode === "drag" && isPhoneLayout) {
    const swipe = event.clientX - flipInstance.pointerDown.clientX;
    const swipesBackward = flipInstance.direction > 0 && swipe > SWIPE_PAN_DISTANCE && flippedSheets > 0;
    const swipesForward = flipInstance.direction < 0 && swipe < -SWIPE_PAN_DISTANCE && flippedSheets < sheetCount;

    if (swipesBackward || swipesForward) {
      const targetView = flipInstance.direction > 0 ? "left" : "right";

      finishFlip(false);
      isPanLocked = true;
      setPhoneView(targetView);
      return;
    }
  }

  if (flipInstance.active && flipInstance.mode === "drag") {
    const moved = Math.hypot(
      event.clientX - flipInstance.pointerDown.clientX,
      event.clientY - flipInstance.pointerDown.clientY,
    );

    flipInstance.dragDistance = Math.max(flipInstance.dragDistance, moved);
    lastPointer = { clientX: event.clientX, clientY: event.clientY };
    flipInstance.target = computeTarget(flipInstance, mousePosToBook.x, mousePosToBook.y);

    requestFrame();
    return;
  }
  
  if (event.pointerType !== "mouse" || skipTarget || (flipInstance.active && flipInstance.mode === "anim")) return;

  const hoverCorner = findHoverCorner(mousePosToBook.x, mousePosToBook.y);
  if (hoverCorner) {
    if (
      flipInstance.active &&
      (flipInstance.direction !== hoverCorner.direction ||
        flipInstance.cornerY !== hoverCorner.cornerY)
    ){
      finishFlip(false);
    }
    
    if (!flipInstance.active) startFlip(hoverCorner.direction, hoverCorner.cornerY);

    const peekDistance = flipInstance.isHardCover
      ? pageWidth * 0.03
      : pageWidth * 0.12;

    flipInstance.isLeaving = false;

    flipInstance.target = limitFoldPoint(
      [
        spreadWidth - peekDistance,
        hoverCorner.cornerY +
          (hoverCorner.cornerY ? -peekDistance : peekDistance),
      ],
      flipInstance,
    );

    requestFrame();
  } else if (flipInstance.active && flipInstance.mode === "peek") {
    flipInstance.target = flipInstance.corner.slice();
    flipInstance.isLeaving = true;
    requestFrame();
  }
}

function releasePointer() {
  if (stage == null) return;
  
  stage.style.cursor = "";
  if (!flipInstance.active || flipInstance.mode !== "drag") return;

  const isTap =
    flipInstance.dragDistance < TAP_MAX_MOVEMENT &&
    performance.now() - flipInstance.pointerDown.time < TAP_MAX_DURATION;
  const horizontalSpeed = flipInstance.velocity[0];

  // phone: tapping near the spine pans to the other page instead of flipping
  const grabbedNearSpine = flipInstance.grabPoint[0] - pageWidth < pageWidth * 0.25;
  const otherPageExists =
    flipInstance.direction > 0 ? flippedSheets > 0 : flippedSheets < sheetCount;
  if (isPhoneLayout && isTap && grabbedNearSpine && otherPageExists) {
    finishFlip(false);
    setPhoneView(flipInstance.direction > 0 ? "left" : "right");
    return;
  }

  flipInstance.completes =
    isTap ||
    horizontalSpeed < -FLICK_SPEED ||
    (horizontalSpeed < FLICK_SPEED &&
      flipInstance.position[0] < pageWidth * FINISH_THRESHOLD);
  flipInstance.isLifting = isTap && flipInstance.completes;
  if (flipInstance.completes) {
    flipInstance.target = flipInstance.isLifting ? liftedCornerTarget(flipInstance) : [0, flipInstance.cornerY];
  } else {
    flipInstance.target = flipInstance.corner.slice();
  }
  flipInstance.mode = "anim";
  requestFrame();
}

// first stop for taps and buttons: lift the corner a bit so the page visibly curls instead of sliding flat.
function liftedCornerTarget(flip) {
  return [
    pageWidth,
    flip.cornerY + (flip.cornerY ? -LIFT_FRACTION : LIFT_FRACTION) * pageHeight,
  ];
}

//#endregion

//#region zoom
function moveZoom(event) {
  if (stage == null) return;
  if (zoomLayer == null) return;

  const stageBounds = stage.getBoundingClientRect();
  zoomLayer.style.transformOrigin =
    event.clientX -
    stageBounds.left +
    "px " +
    (event.clientY - stageBounds.top) +
    "px";
}

function startZoom(event) {
  if (zoomLayer == null) return;
  if (stage == null) return;

  isZooming = true;
  moveZoom(event);
  zoomLayer.offsetWidth; // force a reflow so the origin is applied before the scale animates
  zoomLayer.style.transform = `scale(${CONFIG.zoomLevel})`;
  stage.style.cursor = "none"; // hide the cursor while zooming
  try {
    stage.setPointerCapture(event.pointerId);
  } catch (error) {
    
  }
}

function stopZoom() {
  if (!isZooming) return;

  if (zoomLayer == null) return;
  if (stage == null) return;

  isZooming = false;
  zoomLayer.style.transform = "";
  stage.style.cursor = "";
}

//#endregion

//#region controls
function flipPage(direction, options = {}) {
  if (direction > 0 ? flippedSheets >= sheetCount : flippedSheets <= 0) return;
  if (isPhoneLayout && (direction > 0 ? phoneView === "left" : phoneView === "right")) return;
  if (flipInstance.active && flipInstance.mode === "anim") return;
  if (flipInstance.active && flipInstance.direction !== direction) finishFlip(false);
  if (!flipInstance.active) startFlip(direction, pageHeight, options.faceOverrides);
  
  flipInstance.isFast = Boolean(options.fast);
  flipInstance.holdCamera = Boolean(options.holdCamera);
  flipInstance.mode = "anim";
  flipInstance.completes = true;
  flipInstance.isLifting = true;
  flipInstance.isLeaving = false;
  flipInstance.target = liftedCornerTarget(flipInstance);

  requestFrame();
}

// Phone: from a back side "next" pans to the next front; from a front side "previous" pans to the previous back.
function navigate(direction) {
  if (isPhoneLayout && !(flipInstance.active && flipInstance.mode === "anim")) {
    if (direction > 0 && phoneView === "left") {
      if (flippedSheets < sheetCount) setPhoneView("right");

      return;
    }

    if (direction < 0 && phoneView === "right") {
      if (flippedSheets > 0) setPhoneView("left");

      return;
    }
  }
  flipPage(direction);
}

//   skipToPage(8);
//   skipToPage(8, { instant: true });
//   skipToPage(8).then((arrived) => console.log(arrived));
function skipToPage(pageNumber, options = {}) {
  cancelSkip(false);

  return new Promise((resolve) => {
    const requestedFace = Math.round(Number(pageNumber));

    if (!Number.isFinite(requestedFace)) {
      resolve(false);
      return;
    }

    const faceIndex = Math.max(0, Math.min(faceCount - 1, requestedFace));
    const targetSheets = Math.ceil(faceIndex / 2); // sheets that must be turned to the left
    const targetView = faceIndex % 2 === 0 ? "right" : "left"; // phone: which page of the spread to show

    if (flipInstance.active) finishFlip(false);
    
    if (options.instant) {
      flippedSheets = targetSheets;
      phoneView = targetView;
      renderStaticPages();
      positionCamera();
      updateControls();
      resolve(true);
      return;
    }

    skipTarget = {
      sheets: targetSheets,
      view: targetView,
      resolve,
      instantAnimate: Boolean(options.instantAnimate),
    };

    if (options.instantAnimate) {
      instantAnimateStep(targetSheets, targetView);
    } else {
      continueSkip();
    }
  });
}

function cancelSkip(arrived) {
  if (!skipTarget) return;

  const { resolve } = skipTarget;

  skipTarget = null;
  clearTimeout(skipTimer);
  resolve(arrived);
}

// turns one more sheet toward the target. Called again every time a turn finishes.
function continueSkip() {
  if (!skipTarget || flipInstance.active) return;
  const { sheets: targetSheets, view: targetView } = skipTarget;

  // an instantAnimate turn is a single move: if it ended anywhere else, it was interrupted
  if (skipTarget.instantAnimate && flippedSheets !== targetSheets) {
    cancelSkip(false);
    return;
  }

  if (flippedSheets === targetSheets) {
    if (isPhoneLayout && phoneView !== targetView) setPhoneView(targetView);
    cancelSkip(true);
    return;
  }

  const direction = flippedSheets < targetSheets ? 1 : -1;
  const startView = direction > 0 ? "right" : "left";
  if (isPhoneLayout && phoneView !== startView) {
    // phone: first pan to the side the page turns from, then start turning
    setPhoneView(startView);
    skipTimer = setTimeout(continueSkip, 470);
    return;
  }

  // phone: keep the camera still while pages riffle by; on the last turn only follow the page
  // if the page we want to see is on the far side
  const isLastTurn = flippedSheets + direction === targetSheets;
  const holdCamera = isPhoneLayout && (!isLastTurn || targetView === startView);
  flipPage(direction, { fast: true, holdCamera });
}

// jumps to a resting state with no animation at all (camera and shadows included).
function jumpToState(sheets, view) {
  if (book == null) return;
  if (shadowLeft == null) return;
  if (shadowRight == null) return;

  flippedSheets = sheets;
  phoneView = view;
  book.style.transition =
    shadowLeft.style.transition =
    shadowRight.style.transition =
      "none";
  renderStaticPages();
  positionCamera();
  book.offsetWidth; // apply the jump instantly, then allow animations again
  book.style.transition =
    shadowLeft.style.transition =
    shadowRight.style.transition =
      "";
  updateControls();
}

// skipToPage(..., { instantAnimate: true }): skip the pages in between, but still play one real page turn.
//  - From the closed front cover (or closed back cover) the cover itself swings open onto the target.
//  - From anywhere else the book first jumps to the spread just before the target, then the page next to it turns.
function instantAnimateStep(targetSheets, targetView) {
  if (flippedSheets === targetSheets) {
    // already on the right spread (a phone may still need to pan to the other page)
    if (isPhoneLayout && phoneView !== targetView) setPhoneView(targetView);
    cancelSkip(true);
    return;
  }

  const direction = targetSheets > flippedSheets ? 1 : -1;
  const startView = direction > 0 ? "right" : "left";
  const targetLeftFace = faces[2 * targetSheets - 1];
  const targetRightFace = faces[2 * targetSheets];
  let faceOverrides = { finalSheets: targetSheets };

  const isClosedBook = (flippedSheets === 0 && direction > 0) || (flippedSheets === sheetCount && direction < 0);
  const useAdjacentPage = skipTarget && skipTarget.instantAnimate === "adjacent";

  if (useAdjacentPage && !isClosedBook) {
    // jump to the spread just before the target, then turn the page next to it
    jumpToState(targetSheets - direction, startView);
  } else if (direction > 0) {
    // the page you are looking at turns. Its back shows the target's left page,
    // and the target's right page is uncovered underneath
    faceOverrides = { ...faceOverrides, backFace: targetLeftFace, revealedFace: targetRightFace };
  } else {
    // going backward: the left page you are looking at turns over to the right,
    // showing the target's right page, and the target's left page is uncovered
    faceOverrides = { ...faceOverrides, frontFace: targetRightFace, revealedFace: targetLeftFace };
  }
  
  // phone: keep the camera still when the target page is on the side the turn starts from
  const holdCamera = isPhoneLayout && targetView === startView;
  flipPage(direction, { holdCamera, faceOverrides });
}

function goToPage(pageNumber){
  skipToPage(pageNumber, {instantAnimate: true});
}

//#endregion

function AddPagesFromData(pages, data) {
  if (!data || data.length === 0) {
    console.log("No data found.");
    return;
  }
  
  let currentBatch = [];
  let currentProgram = null;

  const pushProgramDivider = (programName) => {
    pages.push({
      html: `<div class="program-divider">${programName}</div>`,
    });
  };
  
  const pushPage = (programName, students) => {
    if (students.length === 0) return;
    
    //<img src="./assets/img/polaroid.png">
    const studentsHtml = students.map(student => `
      <div class="student-container">
        <div class="image-wrapper" style="transform: rotate(${getRandomRotation()}deg);">
          <img class="grad-pic" src="${convertDriveLinkToEmbed(student["Image URL (Drive)"]) || getRandomPlaceholder()}" alt="${student.Name}">
          <img src="${getRandomImageFrame()}">
          ${student["Overlay Image URL (G Drive)"] && student["Overlay Image URL (G Drive)"].trim() !== "" ? `<img class="overlay" src="${convertDriveLinkToEmbed(student["Overlay Image URL (G Drive)"])}">` : ''}
${student["Portfolio Link"] && student["Portfolio Link"].trim() !== "" ? `<div class="student-link" onclick="openPortfolio('${student["Portfolio Link"]}')"></div>` : ''}        </div>
        <div class="student-info">
          <div class="student-name">${student.Name}</div>
          ${student.Quote && student.Quote.trim() !== "" ? `<div class="student-quote">"${student.Quote}"</div>` : ''}
        </div>
      </div>
    `).join("");
    
    //<div class="ref-layout"></div>
    pages.push({
      html: `
      <img class="background-image" src="./assets/img/bg.jpg">
      <div class="graduates-page">
        <div class="program">${programName}<br>Class of 2026</div>
        <div class="students-holder">
          ${studentsHtml}
        </div>
        
      </div>
      
      `
    });
    
    // <div class="foot">Class of 2026</div>
  };

  // Loop through all data rows
  data.forEach((student, index) => {
    const studentProgram = student.Program;
    
    // true for the very first student too, because currentProgram starts as null
    const isNewProgram = currentProgram !== studentProgram;

    // flush the previous program's last, partly filled page first...
    if (currentProgram !== null && isNewProgram) {
      pushPage(currentProgram, currentBatch);
      currentBatch = [];
    }
    
    currentProgram = studentProgram;
    currentBatch.push(student);

    if (isNewProgram) {
      //pushProgramDivider(studentProgram);
      tocPages.push({name: currentProgram, pageNumber: pages.length - 1});
    }

    // if the batch hits studentsPerPage students, push the page and reset the batch
    if (currentBatch.length === studentsPerPage) {
      pushPage(currentProgram, currentBatch);
      currentBatch = [];
    }
  });
  
  // push any remaining students who didn't fill a full block of studentsPerPage
  if (currentBatch.length > 0) {
    pushPage(currentProgram, currentBatch);
  }
}

async function initialize() {
  
  
  if (stage == null) return;
  if (previousButton == null) return;
  if (nextButton == null) return;
  
  const sheetData = await loadSheetData();

  console.log("Data Loaded");

  const bookPages = [];

  bookPages.push({
    cover: true,
    html: `
      <img class="background-image" src="./assets/img/front.png">
    `,
  });

  tocPages.push({name: "Cover", pageNumber: bookPages.length - 1});

  bookPages.push({
    cover: true,
    html: `<img class="background-image" src="./assets/img/front-op.png">`,
  });
  
  bookPages.push({
    html: ``,
  });

  const tocIndex = bookPages.length - 1;

  bookPages.push({
    html: `<img class="background-image" style="opacity: 0.5" src="./assets/img/pattern.jpg">`,
  });

  bookPages.push({
    html: `
    <img class="background-image" style="opacity: 0.2" src="./assets/img/test.jpg">
    <img class="background-image" src="./assets/img/the-graduates.png">
    `,
  });
  bookPages.push({
    html: `<img class="background-image" style="opacity: 0.2" src="./assets/img/Mural6th.png">`,
  });
  
  AddPagesFromData(bookPages, sheetData);

  bookPages.push({
    cover: true,
    html: `<img class="background-image" src="./assets/img/back-op.png">`,
  });
  bookPages.push({
    cover: true,
    html: `<img class="background-image" src="./assets/img/back.png">`,
  });
  
  // every sheet needs two faces. If the count is odd, add a blank page before the back cover.
  if (bookPages.length % 2 !== 0) {
    bookPages.splice(bookPages.length - 2, 0, { html: "" });
  }
  
  // table of contents

  let tocLinksHtml = "";
  tocPages.forEach((currentTocData) => {
    tocLinksHtml += `<div><span class="toc-button" onclick="goToPage(${currentTocData.pageNumber})">${currentTocData.name}</span></div>`;
  });
  
  bookPages[tocIndex] = {
    html: `
    <div class="table-of-content-page" id="toc">
      TOC
      ${tocLinksHtml}
    </div>
    `,
  };
  
  faceCount = bookPages.length;
  sheetCount = faceCount / 2;

  faces = Array.from({ length: faceCount }, (unusedItem, faceIndex) =>
    createFace(faceIndex, bookPages),
  );

  stage.addEventListener("contextmenu", (event) => event.preventDefault());
  addEventListener("blur", stopZoom);
  
  stage.addEventListener("pointerdown", (event) => handlePointerDown(event));
  
  stage.addEventListener("pointermove", (event) => handlePointerMove(event));
  
  stage.addEventListener("pointerup", (event) => {
    if (event.button === 2 || isZooming) stopZoom();
    else {
      releasePointer();
      isPanLocked = false;
    }
  });
  
  stage.addEventListener("pointercancel", () => {
    stopZoom();
    releasePointer();
    isPanLocked = false;
  });

  stage.addEventListener("pointerleave", () => {
    if (flipInstance.active && flipInstance.mode === "peek") {
      flipInstance.target = flipInstance.corner.slice();
      flipInstance.isLeaving = true;
      requestFrame();
    }
  });

  previousButton.onclick = () => navigate(-1);
  nextButton.onclick = () => navigate(1);
  addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") navigate(1);
    else if (event.key === "ArrowLeft") navigate(-1);
  });
  addEventListener("resize", layoutBook);
  
  layoutBook();
  
  //skipToPage(17, {instantAnimate: true});
  //skipToPage(17, {instant: true});
}

initialize();