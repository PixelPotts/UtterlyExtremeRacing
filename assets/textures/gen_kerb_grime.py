#!/usr/bin/env python3
"""Generate coarse noise normal maps for kerb surfaces."""
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, convolve

rng = np.random.default_rng(42)
SIZE = 512

kx = np.array([[-1,0,1],[-2,0,2],[-1,0,1]], dtype=np.float32)
ky = np.array([[-1,-2,-1],[0,0,0],[1,2,1]], dtype=np.float32)

def to_normal(h, strength):
    dx = convolve(h, kx, mode='wrap') * strength
    dy = convolve(h, ky, mode='wrap') * strength
    nx, ny, nz = -dx, -dy, np.ones_like(dx)
    length = np.sqrt(nx**2 + ny**2 + nz**2)
    nx /= length; ny /= length; nz /= length
    r = ((nx * 0.5 + 0.5) * 255).astype(np.uint8)
    g = ((ny * 0.5 + 0.5) * 255).astype(np.uint8)
    b = ((nz * 0.5 + 0.5) * 255).astype(np.uint8)
    return Image.fromarray(np.stack([r, g, b], axis=-1), 'RGB')

def layered_noise(sigma_coarse, sigma_fine, blend=0.7):
    c = gaussian_filter(rng.standard_normal((SIZE, SIZE)).astype(np.float32), sigma=sigma_coarse)
    f = gaussian_filter(rng.standard_normal((SIZE, SIZE)).astype(np.float32), sigma=sigma_fine)
    h = c * blend + f * (1 - blend)
    return (h - h.min()) / (h.max() - h.min())

# ── Red/white stripe kerb grime: coarse chunky surface ──
h_grime = layered_noise(sigma_coarse=22, sigma_fine=7, blend=0.72)
Image.fromarray((h_grime * 255).astype(np.uint8), 'L').save('kerb_grime.jpg', quality=90)
to_normal(h_grime, strength=5.0).save('kerb_grime_normal.jpg', quality=92)
print("kerb_grime_normal.jpg  (coarse grime, stripes)")

# ── Dirt pile kerb: very coarse lumpy earth ──
h_dirt = layered_noise(sigma_coarse=38, sigma_fine=12, blend=0.78)
Image.fromarray((h_dirt * 255).astype(np.uint8), 'L').save('kerb_dirt.jpg', quality=90)
to_normal(h_dirt, strength=7.0).save('kerb_dirt_normal.jpg', quality=92)
print("kerb_dirt_normal.jpg   (lumpy dirt pile)")
