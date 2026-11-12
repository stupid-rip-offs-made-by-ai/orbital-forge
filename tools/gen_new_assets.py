"""Textures added with the solar-system update: new part icons + skins and body maps.
Usage: python3 tools/gen_new_assets.py assets/textures
"""
import os, sys, shutil
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import gen_textures as g2
import gen_3d_textures as g3

OUT = sys.argv[1] if len(sys.argv) > 1 else "assets/textures"
PPM = 64
WHITE, DARK, ORANGE = (236, 236, 232), (60, 62, 68), (238, 120, 40)
cyl = lambda r: (lambda t: np.full_like(t, r))


def eng_prof(he, ht, hb, throat, exitw, curve=0.7):
    def prof(t):
        h = ht + (hb - ht) * np.clip(t / he, 0, 1)
        b = throat + (exitw - throat) * np.clip((t - he) / (1 - he), 0, 1) ** curve
        return np.where(t < he, h, b)
    return prof


def eng_col(he, bell, hcol=(150, 152, 160)):
    def f(T, u, X, Y):
        c = g2.bands(T, bell, [])
        c[T < he] = g2.col(hcol)
        c[T < he * 0.25] = g2.col(DARK)
        rib = (T >= he) & ((((T - he) * 60).astype(int)) % 3 == 0)
        c[rib] = c[rib] * 0.78
        c[T > 0.97] = g2.col((40, 38, 36))
        return c
    return f


def nova_col(T, u, X, Y):
    c = g2.bands(T, (120, 124, 132), [(0, 0.04, DARK), (0.1, 0.16, (240, 196, 30)), (0.16, 0.19, (30, 30, 32)), (0.56, 0.6, DARK)])
    fins = (T > 0.22) & (T < 0.54) & (((X // 5).astype(int)) % 2 == 0)
    c[fins] = c[fins] * 0.6
    c[T >= 0.6] = g2.col((84, 78, 74))
    rib = (T >= 0.6) & ((((T - 0.6) * 60).astype(int)) % 3 == 0)
    c[rib] = c[rib] * 0.78
    return c


def thor_col(T, u, X, Y):
    return g2.bands(T, WHITE, [(0, 0.035, (40, 90, 190)), (0.06, 0.075, (30, 30, 32)), (0.86, 0.875, (30, 30, 32)), (0.25, 0.253, (170, 170, 170)),
                               (0.5, 0.503, (170, 170, 170)), (0.75, 0.753, (170, 170, 170)), (0.4, 0.46, (40, 90, 190)), (0.93, 1, (60, 56, 54))])


thor_prof = lambda t: np.where(t < 0.93, np.where(t < 0.035, 0.48 + 0.12 * t / 0.035, 0.6), 0.3 + 0.24 * np.clip((t - 0.93) / 0.07, 0, 1))
pod3_prof = lambda t: np.where(t < 0.05, 0.5, 0.58 + (1.25 - 0.58) * (t - 0.05) / 0.95)
pod3_col = lambda T, u, X, Y: g2.bands(T, (212, 214, 218), [(0, 0.05, (80, 82, 90)), (0.94, 1, (92, 60, 36)), (0.28, 0.287, (150, 150, 155)), (0.6, 0.607, (150, 150, 155)), (0.8, 0.84, (40, 90, 190))])
gyro_col = lambda T, u, X, Y: g2.bands(T, (70, 74, 84), [(0.3, 0.7, (60, 150, 230)), (0, 0.1, DARK), (0.9, 1, DARK)])
nose_col = lambda T, u, X, Y: g2.bands(T, WHITE, [(0, 0.16, (40, 90, 190)), (0.96, 1, DARK)])
nose_prof = lambda t: 1.25 * np.sqrt(np.clip(1 - (1 - t) ** 2, 0, 1))


def foam_col(T, u, X, Y):
    c = g2.bands(T, (214, 112, 44), [(0, 0.04, DARK), (0.96, 1, DARK), (0.5, 0.514, (160, 80, 30))])
    return c * (0.94 + 0.08 * np.sin(X * 0.7) * np.sin(Y * 0.9))[..., None]


def icons():
    sp = lambda img, name: g2.save_part(img, name)
    img = g2.to_img(g2.render_body(2.5, 1.9, pod3_prof, pod3_col))
    d = ImageDraw.Draw(img); cx = img.width / 2
    for k in (-1, 0, 1):
        x = cx + k * 30 - 6
        d.ellipse([x - 10, 0.36 * img.height, x + 10, 0.36 * img.height + 16], fill=(20, 32, 64, 255), outline=(60, 60, 70, 255), width=2)
        d.ellipse([x - 6, 0.36 * img.height + 3, x, 0.36 * img.height + 8], fill=(150, 190, 240, 255))
    sp(img, "pod_3")
    sp(g2.to_img(g2.render_body(1.25, 0.35, cyl(0.625), gyro_col)), "gyro")
    sp(g2.to_img(g2.render_body(2.5, 1.9, cyl(1.25), foam_col)), "tank_xl_s")
    sp(g2.to_img(g2.render_body(1.25, 1.2, eng_prof(0.32, 0.6, 0.3, 0.16, 0.5), eng_col(0.32, (96, 86, 78)))), "eng_spark")
    sp(g2.to_img(g2.render_body(1.25, 3.0, eng_prof(0.6, 0.5, 0.42, 0.14, 0.55), nova_col)), "eng_nova")
    sp(g2.to_img(g2.render_body(1.25, 6.5, thor_prof, thor_col)), "srb_thor")
    sp(g2.to_img(g2.render_body(2.5, 2.4, nose_prof, nose_col)), "nose_l")
    shutil.copy(os.path.join(OUT, "parts", "legs.png"), os.path.join(OUT, "parts", "legs_l.png"))
    # winglet (drawn for the right-hand side; the builder mirrors it on the left)
    W, H = round(1.0 * PPM), round(1.3 * PPM)
    im = Image.new("RGBA", (W * 4, H * 4), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    pts = [(0, 0), (W * 4 - 6, H * 4 * 0.66), (W * 4 - 6, H * 4 - 4), (0, H * 4 - 4)]
    d.polygon(pts, fill=(176, 40, 34, 255)); d.line([pts[0], pts[1]], fill=(236, 110, 90, 255), width=12); d.line([pts[1], pts[2]], fill=(110, 24, 20, 255), width=10)
    sp(im.resize((W, H), Image.LANCZOS), "winglet")
    # radial chute
    W, H = round(0.35 * PPM), round(0.7 * PPM)
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([1, 1, W - 2, H - 2], 5, fill=(214, 70, 40, 255), outline=(120, 36, 22, 255), width=2)
    d.rectangle([3, H * 0.45, W - 4, H * 0.58], fill=(240, 240, 235, 255))
    sp(im, "chute_r")
    # solar panel
    W, H = round(2.2 * PPM), round(0.9 * PPM)
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rectangle([0, H * 0.44, 14, H * 0.56], fill=(150, 150, 158, 255))
    d.rectangle([12, 3, W - 2, H - 4], fill=(24, 52, 120, 255), outline=(200, 204, 212, 255), width=2)
    for i in range(1, 8):
        x = 12 + (W - 14) * i / 8
        d.line([(x, 4), (x, H - 5)], fill=(90, 130, 210, 255), width=1)
    for j in range(1, 3):
        y = 3 + (H - 7) * j / 3
        d.line([(13, y), (W - 3, y)], fill=(90, 130, 210, 255), width=1)
    sp(im, "solar")


def skins():
    g3.skin("pod_3", 1.9, pod3_col, W=512, extra=lambda d, W, H: [d.ellipse([W * 0.5 + k * 44 - 14, H * 0.38, W * 0.5 + k * 44 + 14, H * 0.38 + 18], fill=(20, 32, 64), outline=(70, 70, 80), width=2) for k in (-1, 0, 1)])
    g3.skin("gyro", 0.35, gyro_col)
    g3.skin("tank_xl_s", 1.9, foam_col, W=512)
    g3.skin("eng_spark", 1.2, eng_col(0.32, (96, 86, 78)))
    g3.skin("eng_nova", 3.0, nova_col)
    g3.skin("srb_thor", 6.5, thor_col)
    g3.skin("nose_l", 2.4, nose_col)
    shutil.copy(os.path.join(OUT, "skins", "legs.png"), os.path.join(OUT, "skins", "legs_l.png"))


def jpg(arr, name, q=86):
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, name), quality=q, optimize=True)


def craters(p, v, n, seed, big=0.2):
    rng = np.random.default_rng(seed)
    for _ in range(n):
        c = rng.normal(size=3); c /= np.linalg.norm(c)
        ang = (rng.random() ** 3) * big + 0.01
        d = np.arccos(np.clip(p @ c, -1, 1)) / ang
        v = np.where(d < 1, v * (0.8 + 0.12 * d * d), v)
        v = v * (1 + 0.16 * np.clip(1 - np.abs(d - 1.08) / 0.14, 0, 1))
    return v


def bodies():
    W, H = 2048, 1024
    p, lat = g3.sphere_grid(W, H)
    n1 = g3.norm01(g3.fbm3(p, 7, 2.5, 0.55, 1100)); n2 = g3.norm01(g3.fbm3(p, 5, 6, 0.5, 1200))
    # Cinder: scorched brown rock with dark lava plains and craters
    v = craters(p, 0.5 + 0.3 * n1, 150, 1300)
    lava = np.clip((n2 - 0.62) * 5, 0, 1)[..., None]
    col = np.dstack([v * 0.78, v * 0.6, v * 0.47]) * (1 - lava) + lava * np.array([0.2, 0.12, 0.1])
    jpg(col, "cinder_map.jpg")
    # Pebble: small dark grey moon
    v = craters(p, 0.38 + 0.2 * g3.norm01(g3.fbm3(p, 6, 3, 0.55, 1400)), 220, 1500, big=0.3)
    jpg(np.dstack([v * 0.97, v * 0.94, v * 0.9]), "pebble_map.jpg")
    # Ferra: rust deserts, dark basalt regions, polar caps
    col = g3.ramp(n1, [(0, (96, 44, 30)), (0.35, (158, 74, 42)), (0.6, (204, 108, 62)), (0.85, (226, 150, 100)), (1, (240, 190, 150))])
    dark = np.clip((n2 - 0.6) * 4, 0, 1)[..., None]
    col = col * (1 - 0.5 * dark)
    ice = np.clip((np.abs(lat) - 1.25 + (g3.fbm3(p, 4, 6, 0.5, 1600) - 0.5) * 0.2) * 10, 0, 1)[..., None]
    jpg(col * (1 - ice) + ice * np.array([0.95, 0.93, 0.9]), "ferra_map.jpg")
    # Aurea: thick swirling golden cloud deck
    q = p + 0.35 * np.stack([g3.fbm3(p, 4, 2, 0.5, 1700), g3.fbm3(p, 4, 2, 0.5, 1701), g3.fbm3(p, 4, 2, 0.5, 1702)], -1)
    s = g3.norm01(g3.fbm3(q.astype(np.float32) * np.array([1, 3.2, 1], np.float32), 6, 2.2, 0.55, 1800))
    jpg(g3.ramp(s, [(0, (150, 84, 30)), (0.3, (206, 138, 52)), (0.6, (238, 190, 96)), (0.85, (250, 226, 160)), (1, (255, 246, 214))]), "aurea_map.jpg")
    # Jovara: banded gas giant with a storm
    turb = g3.fbm3(p, 5, 3, 0.55, 1900) - 0.5
    band = np.sin((lat + 0.22 * turb) * 13.0) * 0.5 + 0.5
    fine = g3.norm01(g3.fbm3(p * np.array([1, 6, 1], np.float32), 5, 4, 0.5, 2000))
    col = g3.ramp(np.clip(band * 0.8 + fine * 0.2, 0, 1), [(0, (24, 92, 104)), (0.3, (60, 150, 150)), (0.55, (150, 214, 196)), (0.8, (232, 240, 214)), (1, (250, 250, 236))])
    c = np.array([-0.6, -0.33, 0.73]); c /= np.linalg.norm(c)
    d = np.arccos(np.clip(p @ c, -1, 1))
    spot = np.clip(1 - d / 0.2, 0, 1)[..., None] ** 0.6
    jpg(col * (1 - spot) + spot * np.array([0.93, 0.5, 0.32]), "jovara_map.jpg")
    # Glacia: blue-white ice with dark cracks
    base = g3.norm01(g3.fbm3(p, 6, 3, 0.55, 2100))
    crack = np.clip(1 - np.abs(g3.fbm3(p, 5, 4, 0.55, 2200) - 0.5) * 22, 0, 1) ** 2
    col = g3.ramp(base, [(0, (150, 196, 232)), (0.5, (208, 232, 248)), (1, (250, 252, 255))])
    jpg(col * (1 - 0.6 * crack[..., None]) + 0.6 * crack[..., None] * np.array([0.2, 0.36, 0.56]), "glacia_map.jpg")
    # Solara: granulated star surface
    W2, H2 = 512, 256
    p2, _ = g3.sphere_grid(W2, H2)
    g = g3.norm01(g3.fbm3(p2, 5, 10, 0.6, 2300))
    jpg(g3.ramp(g, [(0, (255, 150, 30)), (0.5, (255, 208, 90)), (1, (255, 250, 210))]), "sun_map.jpg", 80)


if __name__ == "__main__":
    icons(); skins(); bodies()
    print("new assets written to", OUT)
