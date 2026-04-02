#!/usr/bin/env python3
"""Generate normal maps from albedo textures using Sobel filter."""
import sys, os
import numpy as np
from PIL import Image

TEXTURES = [
    ("road.webp",          4.0),
    ("dirt.webp",          5.0),
    ("concrete_clean.jpg", 3.5),
    ("concrete_dark.jpg",  3.5),
    ("bricks_red.jpg",     6.0),
    ("bricks_tan.jpg",     6.0),
    ("facade.jpg",         4.0),
]

def sobel_normal_map(img_path, strength):
    img = Image.open(img_path).convert("L")
    # Resize large textures to 1024 for normal map (plenty of detail)
    if max(img.size) > 1024:
        img = img.resize((1024, 1024), Image.LANCZOS)
    h = np.array(img, dtype=np.float32) / 255.0

    # Sobel kernels
    kx = np.array([[-1,0,1],[-2,0,2],[-1,0,1]], dtype=np.float32)
    ky = np.array([[-1,-2,-1],[0,0,0],[1,2,1]], dtype=np.float32)

    from scipy.ndimage import convolve
    dx = convolve(h, kx, mode='wrap') * strength
    dy = convolve(h, ky, mode='wrap') * strength

    nx = -dx
    ny = -dy
    nz = np.ones_like(nx)
    length = np.sqrt(nx**2 + ny**2 + nz**2)
    nx /= length; ny /= length; nz /= length

    r = ((nx * 0.5 + 0.5) * 255).astype(np.uint8)
    g = ((ny * 0.5 + 0.5) * 255).astype(np.uint8)
    b = ((nz * 0.5 + 0.5) * 255).astype(np.uint8)
    normal = np.stack([r, g, b], axis=-1)
    return Image.fromarray(normal, 'RGB')

base = os.path.dirname(os.path.abspath(__file__))
for fname, strength in TEXTURES:
    src = os.path.join(base, fname)
    stem = os.path.splitext(fname)[0]
    dst = os.path.join(base, f"{stem}_normal.jpg")
    print(f"  {fname} -> {stem}_normal.jpg (strength={strength})")
    nm = sobel_normal_map(src, strength)
    nm.save(dst, quality=92)
print("Done.")
