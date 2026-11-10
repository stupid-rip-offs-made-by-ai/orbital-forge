"""Generates every texture used by Orbital Forge.
Usage: python3 tools/gen_textures.py assets/textures
"""
import os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else "assets/textures"
os.makedirs(os.path.join(OUT, "parts"), exist_ok=True)
PPM = 64  # texture pixels per meter for parts


def save(arr, name):
    arr = np.clip(arr, 0, 1)
    img = Image.fromarray((arr * 255).astype(np.uint8))
    img.save(os.path.join(OUT, name + ".png"), optimize=True)


def fbm(size, octaves=6, base=4, pers=0.5, seed=0, tile=False):
    rng = np.random.default_rng(seed)
    total = np.zeros((size, size), np.float32)
    amp, norm, f = 1.0, 0.0, base
    for _ in range(octaves):
        small = rng.random((f, f)).astype(np.float32)
        if tile:
            big = np.tile(small, (3, 3))
            im = Image.fromarray(big, "F").resize((size * 3, size * 3), Image.BICUBIC)
            a = np.asarray(im)[size:2 * size, size:2 * size]
        else:
            im = Image.fromarray(small, "F").resize((size, size), Image.BICUBIC)
            a = np.asarray(im)
        total += amp * a
        norm += amp
        amp *= pers
        f *= 2
    return total / norm


def norm01(a):
    lo, hi = np.percentile(a, 1), np.percentile(a, 99)
    return np.clip((a - lo) / (hi - lo), 0, 1)


def ramp(h, stops):
    xs = [s[0] for s in stops]
    out = np.zeros(h.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = np.interp(h, xs, [s[1][c] / 255 for s in stops])
    return out


def disc_coords(S):
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    cx = (xx + 0.5) / S * 2 - 1
    cy = (yy + 0.5) / S * 2 - 1
    rr = np.sqrt(cx * cx + cy * cy)
    alpha = np.clip((1 - rr) * S / 2 + 0.5, 0, 1)
    nz = np.sqrt(np.clip(1 - rr * rr, 0, 1))
    return cx, cy, rr, alpha, nz


# ---------------------------------------------------------------- planet
def planet():
    S = 1024
    cx, cy, rr, alpha, nz = disc_coords(S)
    h = norm01(fbm(S, 8, 3, 0.55, seed=11) * 0.75 + fbm(S, 5, 10, 0.5, seed=12) * 0.25)
    moist = norm01(fbm(S, 5, 4, 0.5, seed=13))
    land = ramp(h, [(0.0, (10, 32, 80)), (0.45, (22, 70, 140)), (0.53, (40, 120, 185)),
                    (0.545, (214, 200, 140)), (0.57, (92, 150, 62)), (0.68, (48, 112, 46)),
                    (0.8, (112, 108, 78)), (0.9, (140, 134, 126)), (0.96, (238, 240, 245)), (1.0, (255, 255, 255))])
    desert = ramp(h, [(0.0, (10, 32, 80)), (0.53, (40, 120, 185)), (0.545, (220, 200, 140)),
                      (0.7, (196, 160, 98)), (0.85, (150, 118, 80)), (1, (240, 240, 240))])
    dmask = np.clip((moist - 0.62) * 6, 0, 1)[..., None] * (h > 0.545)[..., None]
    col = land * (1 - dmask) + desert * dmask
    # polar ice ring near disc edge reads as poles from any rotation
    col *= (0.55 + 0.45 * nz ** 0.6)[..., None]
    save(np.dstack([col, alpha]), "planet")

    c = fbm(S, 7, 5, 0.55, seed=21)
    c = norm01(c)
    ca = np.clip((c - 0.55) * 3.2, 0, 0.9) * alpha
    cc = np.ones((S, S, 3), np.float32) * (0.75 + 0.25 * nz ** 0.5)[..., None]
    save(np.dstack([cc, ca]), "clouds")


def moon():
    S = 512
    cx, cy, rr, alpha, nz = disc_coords(S)
    base = norm01(fbm(S, 7, 4, 0.55, seed=31))
    maria = np.clip((norm01(fbm(S, 4, 3, 0.5, seed=32)) - 0.6) * 4, 0, 1)
    v = 0.55 + 0.25 * base - 0.18 * maria
    rng = np.random.default_rng(33)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    for _ in range(170):
        r = (rng.random() ** 3) * 45 + 3
        ang = rng.random() * 2 * math.pi
        dist = math.sqrt(rng.random()) * (S / 2 - r)
        x0 = S / 2 + math.cos(ang) * dist
        y0 = S / 2 + math.sin(ang) * dist
        d = np.sqrt((xx - x0) ** 2 + (yy - y0) ** 2) / r
        inside = d < 1
        v = np.where(inside, v * (0.8 + 0.12 * d * d), v)
        rim = np.clip(1 - np.abs(d - 1.08) / 0.14, 0, 1)
        v = v * (1 + 0.16 * rim)
    col = np.dstack([v * 0.98, v * 0.97, v * 0.94])
    col *= (0.55 + 0.45 * nz ** 0.6)[..., None]
    save(np.dstack([col, alpha]), "moon")


def shade():
    S = 512
    cx, cy, rr, alpha, nz = disc_coords(S)
    L = np.array([-0.55, -0.45, 0.70])
    L = L / np.linalg.norm(L)
    diff = np.clip(cx * L[0] + cy * L[1] + nz * L[2], 0, 1)
    dark = (1 - diff) ** 1.6 * 0.85
    spec = np.zeros_like(diff)
    rgb = np.zeros((S, S, 3), np.float32) + spec[..., None] * 4
    a = np.clip(dark + spec, 0, 1) * alpha
    rgb = np.repeat(np.where(dark > spec, 0.0, 1.0)[..., None], 3, 2).astype(np.float32)
    save(np.dstack([rgb, a]), "shade")


def stars():
    S = 1024
    neb = fbm(S, 6, 3, 0.55, seed=41, tile=True)
    neb2 = fbm(S, 6, 4, 0.55, seed=42, tile=True)
    n = np.clip((norm01(neb) - 0.55) * 1.6, 0, 1)
    n2 = np.clip((norm01(neb2) - 0.6) * 1.6, 0, 1)
    col = np.zeros((S, S, 3), np.float32) + np.array([0.012, 0.016, 0.035])
    col += n[..., None] * np.array([0.10, 0.04, 0.16]) + n2[..., None] * np.array([0.02, 0.07, 0.13])
    rng = np.random.default_rng(43)
    for _ in range(2600):
        x, y = rng.integers(0, S), rng.integers(0, S)
        b = rng.random() ** 3
        tint = np.array([1, 1, 1]) * (1 - 0.25 * rng.random()) + np.array([0, 0.05, 0.2]) * rng.random()
        col[y, x] = np.maximum(col[y, x], tint * (0.25 + 0.75 * b))
    img = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    for _ in range(60):
        x, y = rng.integers(8, S - 8), rng.integers(8, S - 8)
        for rad, a in ((3, 40), (2, 110), (1, 255)):
            c = int(a)
            d.ellipse([x - rad, y - rad, x + rad, y + rad], fill=(c, c, min(255, c + 20)))
    img = img.filter(ImageFilter.GaussianBlur(0.4))
    img.save(os.path.join(OUT, "stars.png"), optimize=True)


def ground_tiles():
    S = 256
    n = norm01(fbm(S, 6, 4, 0.6, seed=51, tile=True))
    n2 = norm01(fbm(S, 4, 16, 0.5, seed=52, tile=True))
    g = ramp(n, [(0, (44, 86, 32)), (0.5, (66, 116, 44)), (1, (96, 140, 58))])
    dirt = np.clip((n2 - 0.7) * 4, 0, 1)[..., None]
    g = g * (1 - dirt) + dirt * np.array([0.42, 0.33, 0.22])
    save(g, "ground_grass")
    m = norm01(fbm(S, 7, 4, 0.6, seed=53, tile=True))
    mc = ramp(m, [(0, (88, 88, 86)), (0.5, (128, 127, 122)), (1, (170, 168, 160))])
    save(mc, "ground_moon")


# ---------------------------------------------------------------- particles / fx
def particles():
    S = 64
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    d = np.sqrt((xx + 0.5 - S / 2) ** 2 + (yy + 0.5 - S / 2) ** 2) / (S / 2)
    a = np.clip(1 - d, 0, 1) ** 1.6
    col = ramp(np.clip(1 - d, 0, 1), [(0, (255, 90, 20)), (0.5, (255, 190, 80)), (1, (255, 250, 230))])
    save(np.dstack([col, a]), "flame")
    noise = fbm(S, 4, 4, 0.5, seed=61)
    a2 = np.clip(1 - d, 0, 1) ** 1.2 * (0.6 + 0.4 * norm01(noise))
    sc = np.ones((S, S, 3), np.float32) * (0.8 + 0.2 * norm01(noise))[..., None]
    save(np.dstack([sc, a2]), "smoke")

    W, H = 64, 256
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = (yy + 0.5) / H
    width = 0.18 + 0.82 * t ** 0.6
    u = (xx + 0.5 - W / 2) / (W / 2) / width
    core = np.exp(-u * u * 3.0)
    a = core * (1 - t) ** 1.3 * np.clip(t * 25, 0, 1)
    col = ramp(np.clip(core * (1 - t), 0, 1), [(0, (255, 60, 10)), (0.35, (255, 150, 40)), (0.7, (255, 230, 150)), (1, (255, 255, 245))])
    save(np.dstack([col, a]), "plume")


def canopy():
    W, H = 256, 150
    img = Image.new("RGBA", (W * 4, H * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    stripes = 8
    for i in range(stripes):
        a0 = 180 + 180 * i / stripes
        a1 = 180 + 180 * (i + 1) / stripes
        col = (240, 240, 235, 255) if i % 2 == 0 else (235, 110, 40, 255)
        d.pieslice([8, 8, W * 4 - 8, H * 8 - 8], a0, a1, fill=col)
    # scallops cut the flat bottom
    for i in range(stripes):
        x0 = 8 + (W * 4 - 16) * i / stripes
        x1 = 8 + (W * 4 - 16) * (i + 1) / stripes
        d.ellipse([x0, H * 4 - 40, x1, H * 4 + 40], fill=(0, 0, 0, 0))
    img = img.resize((W, H), Image.LANCZOS)
    arr = np.asarray(img).astype(np.float32) / 255
    yy = np.mgrid[0:H, 0:W][0].astype(np.float32) / H
    arr[..., :3] *= (0.75 + 0.25 * (1 - yy))[..., None]
    save(arr, "canopy")


def pad():
    ppm = 32
    W, H = 20 * ppm, 26 * ppm
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    g = 24 * ppm
    # foundation + slab
    d.rectangle([1.5 * ppm, g, 18.5 * ppm, H], fill=(118, 118, 122, 255))
    d.rectangle([1.5 * ppm, g, 18.5 * ppm, g + 6], fill=(170, 170, 175, 255))
    for i in range(14):
        x = 2 * ppm + i * ppm * 1.2
        d.polygon([(x, g + 8), (x + 14, g + 8), (x + 4, g + 22), (x - 10, g + 22)], fill=(230, 190, 40, 255))
    d.rectangle([7.6 * ppm, g + 6, 12.4 * ppm, g + 2 * ppm], fill=(50, 50, 55, 255))  # flame trench
    # tower
    x0, x1 = 0.6 * ppm, 2.6 * ppm
    top = 2 * ppm
    red = (180, 52, 40, 255)
    d.rectangle([x0, top, x0 + 6, g], fill=red)
    d.rectangle([x1 - 6, top, x1, g], fill=red)
    y = top
    step = 1.6 * ppm
    while y < g - 2:
        d.line([(x0, y), (x1, y + step)], fill=red, width=4)
        d.line([(x1, y), (x0, y + step)], fill=red, width=4)
        d.line([(x0, y), (x1, y)], fill=red, width=4)
        y += step
    # service arms
    for ay in (6 * ppm, 14 * ppm):
        d.rectangle([x1, ay, 8.4 * ppm, ay + 10], fill=(150, 150, 155, 255))
        d.line([(x1, ay + 30), (6.5 * ppm, ay + 10)], fill=(150, 150, 155, 255), width=4)
    # beacon
    d.ellipse([x0 - 2, top - 14, x1 + 2, top + 2], fill=(255, 70, 60, 255))
    d.rectangle([x0 + 10, top - 50, x0 + 14, top - 10], fill=(200, 200, 200, 255))
    img.save(os.path.join(OUT, "pad.png"), optimize=True)


# ---------------------------------------------------------------- parts
def render_body(w_m, h_m, profile, color_fn, light=True):
    W, H = max(2, round(w_m * PPM)), max(2, round(h_m * PPM))
    ys = (np.arange(H) + 0.5) / H
    xs = np.arange(W) + 0.5 - W / 2
    hw = (profile(ys) * PPM)[:, None]
    X = np.repeat(xs[None, :], H, 0)
    Y = np.repeat(np.arange(H)[:, None], W, 1).astype(np.float32)
    T = np.repeat(ys[:, None], W, 1)
    alpha = np.clip(hw - np.abs(X) + 0.5, 0, 1) * (hw > 0.3)
    u = np.clip(X / np.maximum(hw, 1e-3), -1, 1)
    base = color_fn(T, u, X, Y)
    nz = np.sqrt(np.clip(1 - u * u, 0, 1))
    shade_ = 0.30 + 0.60 * nz + 0.16 * (-u)
    spec = 0.30 * np.exp(-((u + 0.42) / 0.16) ** 2)
    rng = np.random.default_rng(int(w_m * 100 + h_m * 1000))
    grain = 1 + 0.025 * (rng.random((H, W)) - 0.5)
    rgb = base * (shade_ * grain)[..., None] + spec[..., None] * light
    return np.dstack([np.clip(rgb, 0, 1), alpha])


def col(c):
    return np.array(c, np.float32) / 255


def bands(T, default, spec):
    out = np.zeros(T.shape + (3,), np.float32) + col(default)
    for t0, t1, c in spec:
        m = (T >= t0) & (T < t1)
        out[m] = col(c)
    return out


def to_img(arr):
    return Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))


def save_part(img, name):
    img.save(os.path.join(OUT, "parts", name + ".png"), optimize=True)


WHITE = (236, 236, 232)
DARK = (60, 62, 68)
ORANGE = (238, 120, 40)


def tanks():
    rim = 0.035

    def prof(r):
        return lambda t: np.full_like(t, r)

    def ts(T, u, X, Y):
        c = bands(T, WHITE, [(0, rim * 4, DARK), (1 - rim * 4, 1, DARK), (0.36, 0.64, ORANGE)])
        return c
    save_part(to_img(render_body(1.25, 0.6, prof(0.625), ts)), "tank_s")

    def tm(T, u, X, Y):
        c = bands(T, WHITE, [(0, 0.03, DARK), (0.97, 1, DARK), (0.49, 0.51, (190, 190, 190))])
        q1 = (T > 0.12) & (T < 0.40) & (u < 0)
        q2 = (T > 0.60) & (T < 0.88) & (u >= 0)
        c[q1 | q2] = col((34, 34, 38))
        return c
    save_part(to_img(render_body(1.25, 1.9, prof(0.625), tm)), "tank_m")

    def tl(T, u, X, Y):
        c = bands(T, WHITE, [(0, 0.015, DARK), (0.985, 1, DARK), (0.08, 0.1, ORANGE), (0.9, 0.92, ORANGE),
                             (0.33, 0.335, (180, 180, 180)), (0.66, 0.665, (180, 180, 180))])
        q = (T > 0.12) & (T < 0.3) & (u < 0)
        c[q] = col((34, 34, 38))
        return c
    save_part(to_img(render_body(1.25, 3.75, prof(0.625), tl)), "tank_l")

    foam = norm01(fbm(256, 5, 8, 0.5, seed=71))

    def txl(T, u, X, Y):
        c = bands(T, (214, 112, 44), [(0, 0.02, DARK), (0.98, 1, DARK), (0.25, 0.257, (160, 80, 30)),
                                      (0.5, 0.507, (160, 80, 30)), (0.75, 0.757, (160, 80, 30))])
        fi = (Y.astype(int) % 256, X.astype(int) % 256)
        f = foam[fi[0], fi[1]]
        return c * (0.92 + 0.12 * f)[..., None]
    save_part(to_img(render_body(2.5, 3.75, prof(1.25), txl)), "tank_xl")

    def ad(T, u, X, Y):
        return bands(T, (205, 207, 210), [(0, 0.05, DARK), (0.95, 1, DARK), (0.45, 0.55, (150, 152, 158))])
    save_part(to_img(render_body(2.5, 1.2, lambda t: 0.625 + 0.625 * t, ad)), "adapter")


def command():
    def pod_prof(t):
        return np.where(t < 0.06, 0.24, 0.28 + (0.625 - 0.28) * (t - 0.06) / 0.94)

    def pod_col(T, u, X, Y):
        c = bands(T, (208, 210, 214), [(0, 0.06, (80, 82, 90)), (0.93, 1, (92, 60, 36)),
                                       (0.3, 0.305, (150, 150, 155)), (0.62, 0.625, (150, 150, 155))])
        return c
    img = to_img(render_body(1.25, 1.2, pod_prof, pod_col))
    d = ImageDraw.Draw(img)
    cx = img.width / 2
    # windows
    d.ellipse([cx - 22, 0.36 * img.height, cx + 2, 0.36 * img.height + 18], fill=(20, 32, 64, 255), outline=(60, 60, 70, 255), width=2)
    d.ellipse([cx - 18, 0.37 * img.height + 2, cx - 10, 0.37 * img.height + 7], fill=(150, 190, 240, 255))
    d.ellipse([cx + 8, 0.42 * img.height, cx + 20, 0.42 * img.height + 10], fill=(20, 32, 64, 255))
    # hatch
    d.rounded_rectangle([cx - 10, 0.66 * img.height, cx + 10, 0.86 * img.height], 4, outline=(120, 120, 128, 255), width=2)
    save_part(img, "pod_c1")

    def pr_prof(t):
        return 0.625 * (0.86 + 0.14 * np.clip(np.minimum(t, 1 - t) / 0.22, 0, 1))
    gold = norm01(fbm(128, 4, 16, 0.5, seed=81))

    def pr_col(T, u, X, Y):
        c = bands(T, (70, 72, 80), [(0.3, 0.7, (214, 166, 60))])
        m = (T >= 0.3) & (T < 0.7)
        g = gold[Y.astype(int) % 128, X.astype(int) % 128]
        c[m] = c[m] * (0.8 + 0.35 * g[m])[..., None]
        return c
    img = to_img(render_body(1.25, 0.5, pr_prof, pr_col))
    d = ImageDraw.Draw(img)
    d.ellipse([img.width / 2 + 14, 4, img.width / 2 + 20, 10], fill=(80, 255, 120, 255))
    save_part(img, "probe")

    def nose_prof(t):
        return 0.625 * np.sqrt(np.clip(1 - (1 - t) ** 2, 0, 1))

    def nose_col(T, u, X, Y):
        return bands(T, WHITE, [(0, 0.16, (200, 40, 36)), (0.95, 1, DARK)])
    save_part(to_img(render_body(1.25, 1.6, nose_prof, nose_col)), "nose")

    def ch_prof(t):
        return 0.38 * np.sqrt(np.clip(t / 0.4, 0, 1))

    def ch_col(T, u, X, Y):
        return bands(T, (214, 70, 40), [(0.6, 0.74, (240, 240, 235)), (0.86, 1, (90, 90, 96))])
    save_part(to_img(render_body(0.8, 0.4, ch_prof, ch_col)), "chute")


def structural():
    def hazard(T, u, X, Y, w):
        c = bands(T, (56, 58, 64), [(0, 0.12, (110, 112, 118)), (0.88, 1, (110, 112, 118))])
        m = (T > 0.32) & (T < 0.68)
        s = ((X + Y) // 8).astype(int) % 2 == 0
        c[m & s] = col((240, 196, 30))
        c[m & ~s] = col((30, 30, 32))
        return c
    save_part(to_img(render_body(1.25, 0.3, lambda t: np.full_like(t, 0.625), lambda *a: hazard(*a, 1))), "decoupler")
    save_part(to_img(render_body(2.5, 0.4, lambda t: np.full_like(t, 1.25), lambda *a: hazard(*a, 2))), "decoupler_l")

    # fins: core + swept fins
    W, H = round(3.4 * PPM), round(1.0 * PPM)
    fin = Image.new("RGBA", (W * 4, H * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(fin)
    cx = W * 2
    s = PPM * 4
    for sign in (-1, 1):
        pts = [(cx + sign * 0.6 * s, 0.02 * s), (cx + sign * 1.68 * s, 0.6 * s), (cx + sign * 1.68 * s, 0.98 * s), (cx + sign * 0.6 * s, 0.98 * s)]
        d.polygon(pts, fill=(176, 40, 34, 255))
        d.line([pts[0], pts[1]], fill=(236, 110, 90, 255), width=10)
        d.line([pts[1], pts[2]], fill=(110, 24, 20, 255), width=8)
    fin = fin.resize((W, H), Image.LANCZOS)
    core = to_img(render_body(3.4, 1.0, lambda t: np.full_like(t, 0.625),
                              lambda T, u, X, Y: bands(T, (200, 202, 206), [(0, 0.06, DARK), (0.94, 1, DARK)])))
    fin.alpha_composite(core)
    save_part(fin, "fins")

    # legs deployed (3.4 x 2.4 with ring in top 0.4 m)
    W, H = round(3.4 * PPM), round(2.4 * PPM)
    ring = to_img(render_body(3.4, 2.4, lambda t: np.where(t < 0.4 / 2.4, 0.64, 0),
                              lambda T, u, X, Y: bands(T, (90, 92, 100), [(0.05, 0.11, (240, 196, 30))])))
    big = Image.new("RGBA", (W * 4, H * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    s = PPM * 4
    cx = W * 2
    for sign in (-1, 1):
        d.line([(cx + sign * 0.58 * s, 0.28 * s), (cx + sign * 1.45 * s, 2.28 * s)], fill=(70, 72, 78, 255), width=int(0.13 * s))
        d.line([(cx + sign * 0.58 * s, 0.1 * s), (cx + sign * 1.05 * s, 1.35 * s)], fill=(230, 186, 40, 255), width=int(0.07 * s))
        d.ellipse([cx + sign * 1.45 * s - 0.3 * s, 2.24 * s, cx + sign * 1.45 * s + 0.3 * s, 2.4 * s - 2], fill=(50, 50, 55, 255))
    big = big.resize((W, H), Image.LANCZOS)
    big.alpha_composite(ring)
    save_part(big, "legs")

    W, H = round(1.6 * PPM), round(0.4 * PPM)
    st = to_img(render_body(1.6, 0.4, lambda t: np.full_like(t, 0.64),
                            lambda T, u, X, Y: bands(T, (90, 92, 100), [(0.3, 0.55, (240, 196, 30))])))
    d = ImageDraw.Draw(st)
    for sign in (-1, 1):
        x = W / 2 + sign * 0.7 * PPM
        d.rectangle([x - 3, 1, x + 3, H - 1], fill=(70, 72, 78, 255))
    save_part(st, "legs_stowed")


def engines():
    def engine(name, w, h, house_end, house_top, house_bot, throat, exitw, bell_col, curve=0.7):
        def prof(t):
            ht = house_top + (house_bot - house_top) * np.clip(t / house_end, 0, 1)
            bt = np.clip((t - house_end) / (1 - house_end), 0, 1)
            bell = throat + (exitw - throat) * bt ** curve
            return np.where(t < house_end, ht, bell)

        def colf(T, u, X, Y):
            c = bands(T, bell_col, [])
            house = T < house_end
            c[house] = col((150, 152, 160))
            c[(T < house_end * 0.25)] = col(DARK)
            rib = (T >= house_end) & ((((T - house_end) * h * 20).astype(int)) % 3 == 0)
            c[rib] = c[rib] * 0.78
            lip = T > 0.97
            c[lip] = col((40, 38, 36))
            return c
        save_part(to_img(render_body(w, h, prof, colf)), name)

    engine("eng_ember", 0.9, 0.9, 0.35, 0.36, 0.22, 0.12, 0.42, (70, 64, 60))
    engine("eng_pivot", 1.25, 1.6, 0.36, 0.62, 0.34, 0.2, 0.56, (66, 62, 60))
    engine("eng_void", 1.25, 1.5, 0.24, 0.5, 0.26, 0.12, 0.61, (150, 150, 160), curve=0.55)
    engine("eng_titan", 2.5, 3.0, 0.3, 1.24, 0.74, 0.38, 1.17, (62, 58, 56))

    def srb_prof(t):
        body = np.where(t < 0.06, 0.48 + 0.12 * t / 0.06, 0.6)
        noz = 0.3 + 0.22 * np.clip((t - 0.88) / 0.12, 0, 1)
        return np.where(t < 0.88, body, noz)

    def srb_col(T, u, X, Y):
        c = bands(T, WHITE, [(0, 0.06, (200, 40, 36)), (0.1, 0.13, (30, 30, 32)), (0.78, 0.81, (30, 30, 32)),
                             (0.35, 0.355, (170, 170, 170)), (0.6, 0.605, (170, 170, 170)), (0.88, 1, (60, 56, 54))])
        return c
    save_part(to_img(render_body(1.25, 3.6, srb_prof, srb_col)), "srb_bolt")


if __name__ == "__main__":
    planet(); moon(); stars(); ground_tiles(); particles(); canopy()
    tanks(); command(); structural(); engines()
    print("textures written to", OUT)
