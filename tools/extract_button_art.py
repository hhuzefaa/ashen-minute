"""
Cut the menu button artwork out of the theme reference sheet (docs/reference/button-theme-sheet.jpg)
into the three textures the title menu uses:

    src/assets/ui/button-normal.png   idle            (sheet: "NORMAL STATE")
    src/assets/ui/button-hover.png    selected/hover  (sheet: "HOVER STATE")
    src/assets/ui/button-pressed.png  pressed flash   (sheet: "CLICKED STATE")

All three are 1092 x 400 RGBA, pixel-aligned with each other, with the baked-in "PLAY GAME" removed
so the game can render its own labels. Nothing is stretched: the clicked state, which is wider and
shorter on the sheet, is scaled uniformly to the same height and its plain middle slab is spliced
(feathered seam) to reach the same width.

    python3 tools/extract_button_art.py [sheet.jpg] [out_dir]

Needs: opencv-python, numpy.
"""
import sys
import cv2
import numpy as np

SHEET = sys.argv[1] if len(sys.argv) > 1 else 'docs/reference/button-theme-sheet.jpg'
OUT = (sys.argv[2] if len(sys.argv) > 2 else 'src/assets/ui').rstrip('/') + '/'
W, H = 1092, 400

im = cv2.imread(SHEET)
assert im is not None and im.shape[1] == 2576, 'expected the 2576 x 1438 theme sheet'


def laplace_fill(img, m, iters=3000, scale=4):
    """Smooth (harmonic) fill of the masked area from its border: no smearing streaks."""
    h, w = m.shape
    sm = cv2.resize(img.astype(np.float32), (w // scale, h // scale), interpolation=cv2.INTER_AREA)
    mm = cv2.resize(m.astype(np.float32), (w // scale, h // scale), interpolation=cv2.INTER_AREA) > 0.01
    f = sm.copy()
    f[mm] = sm[~mm].mean(0)
    k = np.array([[0, .25, 0], [.25, 0, .25], [0, .25, 0]], np.float32)
    for _ in range(iters):
        g = cv2.filter2D(f, -1, k, borderType=cv2.BORDER_REPLICATE)
        f[mm] = g[mm]
    return cv2.resize(f, (w, h), interpolation=cv2.INTER_CUBIC)


def save(name, bgr, alpha):
    cv2.imwrite(OUT + f'button-{name}.png', np.dstack([bgr.astype(np.uint8), alpha.astype(np.uint8)]))


# ---- 1. frame silhouette from the normal state (GrabCut), shared by normal and hover --------------
x0, y0, x1, y1 = 110, 370, 1275, 830
crop = im[y0:y1, x0:x1].copy()
mask = np.zeros(crop.shape[:2], np.uint8)
bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
cv2.grabCut(crop, mask, (30, 25, crop.shape[1] - 60, crop.shape[0] - 50), bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
fg = np.where((mask == 1) | (mask == 3), 1, 0).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
fg = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
inv = (1 - fg).copy()
cv2.floodFill(inv, np.zeros((fg.shape[0] + 2, fg.shape[1] + 2), np.uint8), (0, 0), 0)
fg = fg | inv
ys, xs = np.where(fg)
fx, fy = x0 + xs.min(), y0 + ys.min()
silhouette = fg[ys.min():ys.min() + H, xs.min():xs.min() + W]
assert silhouette.shape == (H, W), silhouette.shape
alpha = cv2.GaussianBlur(silhouette.astype(np.float32) * 255, (0, 0), 1.0)

HOVER_DX = 1193  # hover frame = normal frame shifted right (measured by edge correlation, r = 0.62)
normal = im[fy:fy + H, fx:fx + W].copy()
hover = im[fy:fy + H, fx + HOVER_DX:fx + HOVER_DX + W].copy()


def text_mask(img, bright):
    """Baked label pixels inside the label band, dilated to cover anti-aliasing and glow."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(int)
    roi = np.zeros(img.shape[:2], np.uint8)
    roi[160:257, 230:873] = 1
    cand = (hsv[..., 2] > 200) & (hsv[..., 1] < 175) if bright else hsv[..., 2] > 88
    m = (cand & (roi > 0)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    m = cv2.dilate(m, np.ones((15, 15) if bright else (9, 9), np.uint8))
    return m > 0


# ---- 2. normal: smooth fill over the label band ----------------------------------------------------
tm = text_mask(normal, False)
ys, xs = np.where(tm)
band = np.zeros((H, W), np.uint8)
cv2.rectangle(band, (xs.min() - 22, ys.min() - 22), (xs.max() + 22, ys.max() + 22), 1, -1)
fill = laplace_fill(normal, band)
soft = np.clip(cv2.GaussianBlur(band.astype(np.float32), (0, 0), 10)[..., None] * 1.6, 0, 1)
rng = np.random.default_rng(7)
grain = cv2.GaussianBlur(rng.normal(0, 1, (H, W)).astype(np.float32), (0, 0), 1.2)[..., None] * 3.0
save('normal', np.clip(normal * (1 - soft) + fill * soft + grain * soft, 0, 255), alpha)

# ---- 3. hover: wider band (outside the label's glow), smoky variation, re-seeded sparks -------------
tm = text_mask(hover, True)
ys, xs = np.where(tm)
band = np.zeros((H, W), np.uint8)
cv2.rectangle(band, (xs.min() - 26, ys.min() - 38), (xs.max() + 26, ys.max() + 24), 1, -1)
fill = laplace_fill(hover, band)
soft = np.clip(cv2.GaussianBlur(band.astype(np.float32), (0, 0), 12)[..., None] * 1.6, 0, 1)
rng = np.random.default_rng(9)
smoke = cv2.GaussianBlur(rng.normal(0, 1, (H, W)).astype(np.float32), (0, 0), 6)[..., None] * 14
out = np.clip(hover * (1 - soft) + fill * soft + smoke * soft * np.array([0.5, 0.8, 1.0]), 0, 255).astype(np.uint8)
layer = np.zeros((H, W, 3), np.float32)
py, px = np.where(soft[..., 0] > 0.6)
rng = np.random.default_rng(11)
for i in rng.choice(len(px), 32, replace=False):
    r, b = rng.uniform(0.8, 2.2) ** 1.3, rng.uniform(0.35, 1.0)
    cv2.circle(layer, (int(px[i]), int(py[i])), int(round(r)), (30 * b, 130 * b, 255 * b), -1, lineType=cv2.LINE_AA)
out = np.clip(out + layer * 0.9 + cv2.GaussianBlur(layer, (0, 0), 2.5) * 1.2, 0, 255)
save('hover', out, alpha)

# ---- 4. pressed: clicked state, uniform scale to H, middle slab spliced to W ------------------------
cx0, cx1, cy0, cy1 = 608, 1968, 1007, 1310
c = im[cy0:cy1, cx0:cx1].copy()
hsv = cv2.cvtColor(c, cv2.COLOR_BGR2HSV).astype(int)
roi = np.zeros(c.shape[:2], np.uint8)
roi[95:250, 320:1040] = 1
tm = (((hsv[..., 2] > 120) | ((hsv[..., 1] > 80) & (hsv[..., 2] > 45))) & (roi > 0)).astype(np.uint8)
tm = cv2.morphologyEx(tm, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
tm = cv2.dilate(tm, np.ones((15, 15), np.uint8)) & roi
fill = laplace_fill(c, tm, iters=2500, scale=3)
soft = np.clip(cv2.GaussianBlur(tm.astype(np.float32), (0, 0), 5)[..., None] * 1.5, 0, 1)
rng = np.random.default_rng(5)
g1 = cv2.GaussianBlur(rng.normal(0, 1, c.shape[:2]).astype(np.float32), (0, 0), 0.9) * 7
g2 = cv2.GaussianBlur(rng.normal(0, 1, c.shape[:2]).astype(np.float32), (0, 0), 7) * 22
cc = np.clip(c * (1 - soft) + (fill + (g1 + g2)[..., None] * np.array([1, 1, 1.05])) * soft, 0, 255)
s = H / c.shape[0]
big = cv2.resize(cc, (int(round(c.shape[1] * s)), H), interpolation=cv2.INTER_AREA)
BW, half, feather = big.shape[1], W // 2, 90
left, right = big[:, :half + feather // 2], big[:, BW - (W - half) - feather // 2:]
out = np.zeros((H, W, 3), np.float32)
out[:, :half - feather // 2] = left[:, :half - feather // 2]
out[:, half + feather // 2:] = right[:, feather:]
for i in range(feather):
    t = i / (feather - 1)
    t = t * t * (3 - 2 * t)
    xl = half - feather // 2 + i
    out[:, xl] = left[:, xl] * (1 - t) + right[:, i] * t
a = np.zeros((H, W), np.float32)
a[2:H - 2, 2:W - 2] = 255
save('pressed', out, cv2.GaussianBlur(a, (0, 0), 1.2))
print('wrote', OUT + 'button-{normal,hover,pressed}.png')

# ---- 5. wide variants (1500 x 400) for the pause and completion menus -----------------------------
# The pause reference uses wider buttons. Nothing is stretched: both ends (corners + rune circles)
# are kept 1:1 and the plain middle of the same artwork is extended with feathered seams.
NW, KEEP, FEATHER = 1500, 460, 60


def widen(img):
    h, w = img.shape[:2]
    img = img.astype(np.float32)
    out = np.zeros((h, NW, img.shape[2]), np.float32)
    mid_w = NW - 2 * KEEP + 2 * FEATHER                    # middle strip incl. both overlaps
    # the plain centre of the artwork (no runes), extended by mirroring so every seam is continuous
    strip = img[:, 420:672]
    mid = np.concatenate([strip, strip[:, ::-1]] * 3, 1)[:, :mid_w]
    out[:, :KEEP] = img[:, :KEEP]
    out[:, NW - KEEP:] = img[:, w - KEEP:]
    ramp = np.linspace(0, 1, FEATHER)[None, :, None]
    ramp = ramp * ramp * (3 - 2 * ramp)
    m0 = KEEP - FEATHER                                    # middle starts under the left keep's tail
    out[:, KEEP:NW - KEEP] = mid[:, FEATHER:FEATHER + (NW - 2 * KEEP)]
    out[:, m0:KEEP] = img[:, m0:KEEP] * (1 - ramp) + mid[:, :FEATHER] * ramp
    r0 = NW - KEEP
    out[:, r0:r0 + FEATHER] = mid[:, mid_w - FEATHER:] * (1 - ramp) + img[:, w - KEEP:w - KEEP + FEATHER] * ramp
    return out


for name in ('normal', 'hover', 'pressed'):
    src = cv2.imread(OUT + f'button-{name}.png', cv2.IMREAD_UNCHANGED)
    cv2.imwrite(OUT + f'button-{name}-wide.png', np.clip(widen(src), 0, 255).astype(np.uint8))
print('wrote', OUT + 'button-{normal,hover,pressed}-wide.png')
