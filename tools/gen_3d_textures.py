"""Generates the 3D textures: equirectangular planet/moon/cloud maps, part skins, lattice.
Usage: python3 tools/gen_3d_textures.py assets/textures
"""
import os, sys, math
import numpy as np
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else "assets/textures"
os.makedirs(os.path.join(OUT, "skins"), exist_ok=True)


def save(arr, path):
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, path), optimize=True)


def sphere_grid(W, H):
    """Unit-sphere points matching three.js SphereGeometry UVs."""
    u = (np.arange(W) + 0.5) / W
    v = (np.arange(H) + 0.5) / H
    phi = u[None, :] * 2 * np.pi
    theta = v[:, None] * np.pi  # image row 0 = v=1 = top = theta 0
    x = -np.cos(phi) * np.sin(theta)
    y = np.cos(theta) * np.ones_like(phi)
    z = np.sin(phi) * np.sin(theta)
    return np.stack([x, y, z], -1).astype(np.float32), (np.pi / 2 - theta) * np.ones_like(phi)


def vnoise3(p, freq, seed, G=128):
    rng = np.random.default_rng(seed)
    table = rng.random((G, G, G), dtype=np.float32)
    q = p * freq + 1000.0
    i = np.floor(q).astype(np.int64)
    f = q - i
    f = f * f * (3 - 2 * f)
    out = np.zeros(p.shape[:-1], np.float32)
    for dx in (0, 1):
        wx = f[..., 0] if dx else 1 - f[..., 0]
        for dy in (0, 1):
            wy = f[..., 1] if dy else 1 - f[..., 1]
            for dz in (0, 1):
                wz = f[..., 2] if dz else 1 - f[..., 2]
                out += wx * wy * wz * table[(i[..., 0] + dx) % G, (i[..., 1] + dy) % G, (i[..., 2] + dz) % G]
    return out


def fbm3(p, octaves, base, pers, seed):
    tot = np.zeros(p.shape[:-1], np.float32)
    amp, norm, f = 1.0, 0.0, base
    for k in range(octaves):
        tot += amp * vnoise3(p, f, seed + k * 17)
        norm += amp
        amp *= pers
        f *= 2
    return tot / norm


def norm01(a):
    lo, hi = np.percentile(a, 1), np.percentile(a, 99)
    return np.clip((a - lo) / (hi - lo), 0, 1)


def ramp(h, stops):
    out = np.zeros(h.shape + (3,), np.float32)
    xs = [s[0] for s in stops]
    for c in range(3):
        out[..., c] = np.interp(h, xs, [s[1][c] / 255 for s in stops])
    return out


def planet():
    W, H = 2048, 1024
    p, lat = sphere_grid(W, H)
    h = norm01(fbm3(p, 8, 2.2, 0.55, 100) * 0.8 + fbm3(p, 4, 7, 0.5, 200) * 0.2)
    moist = norm01(fbm3(p, 5, 3, 0.5, 300))
    land = ramp(h, [(0.0, (10, 32, 80)), (0.45, (22, 70, 140)), (0.53, (40, 120, 185)),
                    (0.545, (214, 200, 140)), (0.57, (92, 150, 62)), (0.68, (48, 112, 46)),
                    (0.8, (112, 108, 78)), (0.9, (140, 134, 126)), (0.96, (238, 240, 245)), (1.0, (255, 255, 255))])
    desert = ramp(h, [(0.0, (10, 32, 80)), (0.53, (40, 120, 185)), (0.545, (220, 200, 140)),
                      (0.7, (196, 160, 98)), (0.85, (150, 118, 80)), (1, (240, 240, 240))])
    dm = (np.clip((moist - 0.62) * 6, 0, 1) * (h > 0.545))[..., None]
    col = land * (1 - dm) + desert * dm
    ice = np.clip((np.abs(lat) - 1.18 + (fbm3(p, 4, 6, 0.5, 400) - 0.5) * 0.25) * 8, 0, 1)[..., None]
    col = col * (1 - ice) + ice * np.array([0.93, 0.95, 0.98])
    save(col, "planet_map.jpg")
    # specular-ish: ocean mask stored in its own map (used as roughness hint)
    c = norm01(fbm3(p, 7, 3.0, 0.55, 500))
    a = np.clip((c - 0.52) * 3.0, 0, 0.92)
    save(np.dstack([np.ones_like(a), np.ones_like(a), np.ones_like(a), a]), "clouds_map.png")


def moon():
    W, H = 1024, 512
    p, lat = sphere_grid(W, H)
    base = norm01(fbm3(p, 7, 3, 0.55, 600))
    maria = np.clip((norm01(fbm3(p, 4, 1.6, 0.5, 700)) - 0.6) * 4, 0, 1)
    v = 0.55 + 0.25 * base - 0.17 * maria
    rng = np.random.default_rng(800)
    for _ in range(260):
        c = rng.normal(size=3)
        c /= np.linalg.norm(c)
        ang = (rng.random() ** 3) * 0.22 + 0.008
        d = np.arccos(np.clip(p @ c, -1, 1)) / ang
        v = np.where(d < 1, v * (0.8 + 0.12 * d * d), v)
        rim = np.clip(1 - np.abs(d - 1.08) / 0.14, 0, 1)
        v = v * (1 + 0.16 * rim)
    save(np.dstack([v * 0.98, v * 0.97, v * 0.94]), "moon_map.jpg")


def lattice():
    S = 128
    img = Image.new("RGBA", (S, S * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    red = (190, 55, 42, 255)
    d.rectangle([0, 0, 9, S * 4], fill=red)
    d.rectangle([S - 10, 0, S, S * 4], fill=red)
    for k in range(4):
        y = k * S
        d.line([(0, y), (S, y + S)], fill=red, width=7)
        d.line([(S, y), (0, y + S)], fill=red, width=7)
        d.rectangle([0, y, S, y + 6], fill=red)
    img.save(os.path.join(OUT, "lattice.png"), optimize=True)


# ---------------------------------------------------------------- part skins (unwrapped around the axis)
def col(c):
    return np.array(c, np.float32) / 255


WHITE, DARK, ORANGE = (236, 236, 232), (60, 62, 68), (238, 120, 40)


def skin(name, h_m, fn, W=256, ppm=64, extra=None):
    H = max(8, round(h_m * ppm))
    T = np.repeat(((np.arange(H) + 0.5) / H)[:, None], W, 1)
    a = np.repeat(((np.arange(W) + 0.5) / W * 2 * np.pi)[None, :], H, 0)
    u = -np.sin(a)  # u<0 / u>0 split the skin into two halves (roll patterns)
    X = np.repeat(np.arange(W)[None, :], H, 0).astype(np.float32)
    Y = np.repeat(np.arange(H)[:, None], W, 1).astype(np.float32)
    rgb = fn(T, u, X, Y)
    rng = np.random.default_rng(len(name))
    rgb = rgb * (1 + 0.03 * (rng.random((H, W, 1)) - 0.5))
    img = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))
    if extra:
        extra(ImageDraw.Draw(img), W, H)
    img.save(os.path.join(OUT, "skins", name + ".png"), optimize=True)


def bands(T, default, spec):
    out = np.zeros(T.shape + (3,), np.float32) + col(default)
    for t0, t1, c in spec:
        out[(T >= t0) & (T < t1)] = col(c)
    return out


def skins():
    skin("tank_s", 0.6, lambda T, u, X, Y: bands(T, WHITE, [(0, 0.14, DARK), (0.86, 1, DARK), (0.36, 0.64, ORANGE)]))

    def tm(T, u, X, Y):
        c = bands(T, WHITE, [(0, 0.03, DARK), (0.97, 1, DARK), (0.49, 0.51, (190, 190, 190))])
        c[((T > 0.12) & (T < 0.40) & (u < 0)) | ((T > 0.60) & (T < 0.88) & (u >= 0))] = col((34, 34, 38))
        return c
    skin("tank_m", 1.9, tm)

    def tl(T, u, X, Y):
        c = bands(T, WHITE, [(0, 0.015, DARK), (0.985, 1, DARK), (0.08, 0.1, ORANGE), (0.9, 0.92, ORANGE),
                             (0.33, 0.335, (180, 180, 180)), (0.66, 0.665, (180, 180, 180))])
        c[(T > 0.12) & (T < 0.3) & (u < 0)] = col((34, 34, 38))
        return c
    skin("tank_l", 3.75, tl)
    W, H = 512, 240
    pp = np.stack(np.meshgrid(np.linspace(0, 6, W), np.linspace(0, 3, H)), -1)
    foam = norm01(vnoise3(np.dstack([pp, np.zeros((H, W, 1))]).astype(np.float32), 4, 900) * 0.6
                  + vnoise3(np.dstack([pp, np.zeros((H, W, 1))]).astype(np.float32), 12, 901) * 0.4)

    def txl(T, u, X, Y):
        c = bands(T, (214, 112, 44), [(0, 0.02, DARK), (0.98, 1, DARK), (0.25, 0.257, (160, 80, 30)),
                                      (0.5, 0.507, (160, 80, 30)), (0.75, 0.757, (160, 80, 30))])
        f = foam[Y.astype(int) % H, X.astype(int) % W]
        return c * (0.9 + 0.15 * f)[..., None]
    skin("tank_xl", 3.75, txl, W=512)
    skin("adapter", 1.2, lambda T, u, X, Y: bands(T, (205, 207, 210), [(0, 0.05, DARK), (0.95, 1, DARK), (0.45, 0.55, (150, 152, 158))]))

    def pod_extra(d, W, H):
        # windows on the front (u≈0 facing +z at a = π)
        for cx, cy, rx, ry in ((W * 0.5 - 10, H * 0.42, 14, 10), (W * 0.5 + 24, H * 0.45, 8, 6)):
            d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(20, 32, 64), outline=(70, 70, 80), width=2)
            d.ellipse([cx - rx * 0.6, cy - ry * 0.6, cx - rx * 0.1, cy - ry * 0.1], fill=(150, 190, 240))
        d.rounded_rectangle([W * 0.75 - 12, H * 0.62, W * 0.75 + 12, H * 0.88], 4, outline=(120, 120, 128), width=2)
    skin("pod_c1", 1.2, lambda T, u, X, Y: bands(T, (208, 210, 214), [(0, 0.06, (80, 82, 90)), (0.93, 1, (92, 60, 36)),
                                                                     (0.3, 0.31, (150, 150, 155)), (0.62, 0.63, (150, 150, 155))]), extra=pod_extra)
    gold = norm01(vnoise3(np.random.default_rng(3).random((64, 256, 3)).astype(np.float32) * 8, 3, 950))

    def pr(T, u, X, Y):
        c = bands(T, (70, 72, 80), [(0.3, 0.7, (214, 166, 60))])
        m = (T >= 0.3) & (T < 0.7)
        g = gold[Y.astype(int) % 64, X.astype(int) % 256]
        c[m] = c[m] * (0.75 + 0.4 * g[m])[..., None]
        return c
    skin("probe", 0.5, pr, extra=lambda d, W, H: d.ellipse([W * 0.5 - 3, 3, W * 0.5 + 3, 9], fill=(80, 255, 120)))
    skin("nose", 1.6, lambda T, u, X, Y: bands(T, WHITE, [(0, 0.16, (200, 40, 36)), (0.95, 1, DARK)]))
    skin("chute", 0.4, lambda T, u, X, Y: bands(T, (214, 70, 40), [(0.6, 0.74, (240, 240, 235)), (0.86, 1, (90, 90, 96))]))

    def hazard(T, u, X, Y):
        c = bands(T, (56, 58, 64), [(0, 0.12, (110, 112, 118)), (0.88, 1, (110, 112, 118))])
        m = (T > 0.32) & (T < 0.68)
        s = ((X + Y) // 8).astype(int) % 2 == 0
        c[m & s] = col((240, 196, 30))
        c[m & ~s] = col((30, 30, 32))
        return c
    skin("decoupler", 0.3, hazard)
    skin("decoupler_l", 0.4, hazard)
    skin("fins", 1.0, lambda T, u, X, Y: bands(T, (200, 202, 206), [(0, 0.06, DARK), (0.94, 1, DARK)]))
    skin("legs", 0.4, lambda T, u, X, Y: bands(T, (90, 92, 100), [(0.3, 0.6, (240, 196, 30))]))

    def eng(house_end, bell):
        def f(T, u, X, Y):
            c = bands(T, bell, [])
            c[T < house_end] = col((150, 152, 160))
            c[T < house_end * 0.25] = col(DARK)
            rib = (T >= house_end) & ((((T - house_end) * 60).astype(int)) % 3 == 0)
            c[rib] = c[rib] * 0.78
            c[T > 0.97] = col((40, 38, 36))
            return c
        return f
    skin("eng_ember", 0.9, eng(0.35, (70, 64, 60)))
    skin("eng_pivot", 1.6, eng(0.36, (66, 62, 60)))
    skin("eng_void", 1.5, eng(0.24, (150, 150, 160)))
    skin("eng_titan", 3.0, eng(0.3, (62, 58, 56)))
    skin("srb_bolt", 3.6, lambda T, u, X, Y: bands(T, WHITE, [(0, 0.06, (200, 40, 36)), (0.1, 0.13, (30, 30, 32)), (0.78, 0.81, (30, 30, 32)),
                                                              (0.35, 0.355, (170, 170, 170)), (0.6, 0.605, (170, 170, 170)), (0.88, 1, (60, 56, 54))]))


if __name__ == "__main__":
    lattice(); skins(); moon(); planet()
    print("3D textures written to", OUT)
