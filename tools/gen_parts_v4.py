"""Icons + skins for the 13 parts added in the fourth update.
Usage: python3 tools/gen_parts_v4.py assets/textures
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import gen_textures as g2
import gen_3d_textures as g3
import gen_new_assets as gn

OUT = gn.OUT
PPM = 64
WHITE, DARK, ORANGE = gn.WHITE, gn.DARK, gn.ORANGE
cyl = gn.cyl
BLUE = (40, 90, 190)

can_prof = lambda t: np.where(t < 0.12, 0.45 + 0.175 * t / 0.12, np.where(t > 0.9, 0.625 - 0.1 * (t - 0.9) / 0.1, 0.625))
can_col = lambda T, u, X, Y: g2.bands(T, (206, 170, 84), [(0, 0.12, (90, 92, 100)), (0.9, 1, (90, 92, 100)), (0.5, 0.52, (150, 120, 50))])
s2_col = lambda T, u, X, Y: g2.bands(T, WHITE, [(0, 0.08, DARK), (0.92, 1, DARK), (0.4, 0.6, BLUE)])
flea_prof = lambda t: np.where(t < 0.86, np.where(t < 0.1, 0.3 + 0.15 * t / 0.1, 0.45), 0.22 + 0.18 * np.clip((t - 0.86) / 0.14, 0, 1))
flea_col = lambda T, u, X, Y: g2.bands(T, WHITE, [(0, 0.1, (200, 40, 36)), (0.14, 0.18, (30, 30, 32)), (0.72, 0.76, (30, 30, 32)), (0.86, 1, (60, 56, 54))])
shield_col = lambda T, u, X, Y: g2.bands(T, (104, 66, 40), [(0, 0.3, (150, 152, 160))])
shield_prof = lambda r: (lambda t: r * np.sqrt(np.clip(1 - (t * 0.92) ** 2, 0.05, 1)))
chl_prof = lambda t: 0.6 * np.sqrt(np.clip(t / 0.4, 0, 1))
chl_col = lambda T, u, X, Y: g2.bands(T, (40, 90, 190), [(0.55, 0.72, (240, 240, 235)), (0.86, 1, (90, 90, 96))])
lab_col = lambda T, u, X, Y: g2.bands(T, WHITE, [(0, 0.04, DARK), (0.96, 1, DARK), (0.14, 0.2, BLUE), (0.8, 0.86, BLUE)])
finl_col = lambda T, u, X, Y: g2.bands(T, (200, 202, 206), [(0, 0.05, DARK), (0.95, 1, DARK)])


def xxl_col(T, u, X, Y):
    c = g2.bands(T, (214, 112, 44), [(0, 0.012, DARK), (0.988, 1, DARK)] + [(k / 8, k / 8 + 0.004, (160, 80, 30)) for k in range(1, 8)])
    return c * (0.94 + 0.08 * np.sin(X * 0.7) * np.sin(Y * 0.9))[..., None]


def truss_fn(hx):
    def f(T, u, X, Y):
        a = hx(u, X) % 1.0
        m = (np.abs(a - T) < 0.07) | (np.abs(a - (1 - T)) < 0.07) | (a < 0.07) | (a > 0.93) | (T < 0.07) | (T > 0.93)
        c = np.zeros(T.shape + (3,), np.float32) + g2.col((34, 36, 42))
        c[m] = g2.col((176, 178, 186))
        return c
    return f


def portholes(d, W, H, n, y, r):
    for k in range(n):
        x = W * (k + 0.5) / n
        d.ellipse([x - r, H * y - r, x + r, H * y + r], fill=(20, 32, 64), outline=(70, 70, 80), width=2)
        d.ellipse([x - r * 0.6, H * y - r * 0.6, x - r * 0.05, H * y - r * 0.05], fill=(150, 190, 240))


def icons():
    sp = g2.save_part
    img = g2.to_img(g2.render_body(1.25, 1.1, can_prof, can_col))
    d = ImageDraw.Draw(img); cx = img.width / 2
    d.rounded_rectangle([cx - 14, 0.3 * img.height, cx + 14, 0.3 * img.height + 20], 5, fill=(20, 32, 64, 255), outline=(60, 60, 70, 255), width=2)
    d.rectangle([cx - 9, 0.3 * img.height + 4, cx - 2, 0.3 * img.height + 9], fill=(150, 190, 240, 255))
    sp(img, "pod_can")
    sp(g2.to_img(g2.render_body(1.25, 1.0, cyl(0.625), s2_col)), "tank_s2")
    sp(g2.to_img(g2.render_body(2.5, 7.5, cyl(1.25), xxl_col)), "tank_xxl")
    sp(g2.to_img(g2.render_body(1.25, 1.8, gn.eng_prof(0.38, 0.62, 0.42, 0.24, 0.6), gn.eng_col(0.38, (74, 66, 60), (200, 60, 50)))), "eng_hawk")
    sp(g2.to_img(g2.render_body(2.5, 2.2, gn.eng_prof(0.25, 1.22, 0.62, 0.3, 1.2, 0.55), gn.eng_col(0.25, (150, 150, 162)))), "eng_kestrel")
    sp(g2.to_img(g2.render_body(0.9, 1.8, flea_prof, flea_col)), "srb_flea")
    sp(g2.to_img(g2.render_body(1.25, 1.2, cyl(0.55), truss_fn(lambda u, X: (u + 1) * 1.0))), "truss")
    sp(g2.to_img(g2.render_body(1.25, 0.25, shield_prof(0.625), shield_col)), "shield")
    sp(g2.to_img(g2.render_body(2.5, 0.4, shield_prof(1.25), shield_col)), "shield_l")
    Image.open(os.path.join(OUT, "parts", "fins.png")).resize((round(6.8 * PPM), round(1.6 * PPM)), Image.LANCZOS).save(os.path.join(OUT, "parts", "fins_l.png"))
    sp(g2.to_img(g2.render_body(1.25, 0.5, chl_prof, chl_col)), "chute_l")
    img = g2.to_img(g2.render_body(1.25, 1.7, cyl(0.625), lab_col))
    d = ImageDraw.Draw(img)
    for k in (-1, 0, 1):
        x = img.width / 2 + k * 22 - 4
        d.ellipse([x - 8, img.height * 0.5 - 8, x + 8, img.height * 0.5 + 8], fill=(20, 32, 64, 255), outline=(70, 70, 80, 255), width=2)
    sp(img, "lab")
    W = H = PPM
    im = Image.new("RGBA", (W * 4, H * 4), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rectangle([0, H * 2 - 8, W * 2, H * 2 + 8], fill=(120, 122, 130, 255))
    d.pieslice([W * 1.2, H * 0.2, W * 4.6, H * 3.8], 110, 250, fill=(232, 232, 238, 255), outline=(150, 150, 158, 255), width=8)
    d.line([(W * 2, H * 2), (W * 3.6, H * 2)], fill=(90, 92, 100, 255), width=10)
    d.ellipse([W * 3.5, H * 2 - 14, W * 3.5 + 28, H * 2 + 14], fill=(200, 60, 50, 255))
    sp(im.resize((W, H), Image.LANCZOS), "dish")


def skins():
    g3.skin("pod_can", 1.1, can_col, extra=lambda d, W, H: (d.rounded_rectangle([W * 0.5 - 18, H * 0.3, W * 0.5 + 18, H * 0.3 + 22], 5, fill=(20, 32, 64), outline=(70, 70, 80), width=2),
                                                         d.rectangle([W * 0.5 - 12, H * 0.3 + 4, W * 0.5 - 3, H * 0.3 + 10], fill=(150, 190, 240))))
    g3.skin("tank_s2", 1.0, s2_col)
    g3.skin("tank_xxl", 7.5, xxl_col, W=512)
    g3.skin("eng_hawk", 1.8, gn.eng_col(0.38, (74, 66, 60), (200, 60, 50)))
    g3.skin("eng_kestrel", 2.2, gn.eng_col(0.25, (150, 150, 162)), W=512)
    g3.skin("srb_flea", 1.8, flea_col)
    g3.skin("truss", 1.2, truss_fn(lambda u, X: X / 256 * 4))
    g3.skin("shield", 0.25, shield_col)
    g3.skin("shield_l", 0.4, shield_col, W=512)
    g3.skin("fins_l", 1.6, finl_col, W=512)
    g3.skin("chute_l", 0.5, chl_col)
    g3.skin("lab", 1.7, lab_col, extra=lambda d, W, H: portholes(d, W, H, 6, 0.5, 11))


if __name__ == "__main__":
    icons(); skins()
    print("v4 parts written to", OUT)
