"""
Build the two fire ambience loops from CC BY 3.0 recordings (credits in docs/ASSETS_LICENSES.md):

    fire_bed.ogg      <- fire_large.ogg   (Dynamicell, freesound.org/people/Dynamicell/sounds/17548/)
    fire_crackle.ogg  <- fire_small.ogg   (dobroide,   freesound.org/people/dobroide/sounds/4211/)

Both were taken from Minetest Game's fire mod (mods/fire/sounds), which redistributes them under
CC BY 3.0. Processing (no new sounds are synthesised):
  * bed: gentle band-limit (90 Hz - 5.5 kHz) to take the hiss and the rumble off the roar
  * crackle: band-limit 70 Hz - 6.5 kHz, and a soft limiter that tames only the sharpest pops (peaks more
    than 12 dB above the surrounding crackle bed are compressed 4:1), so it stays crackly
    without piercing transients
  * each file becomes a seamless loop: its tail is equal-power cross-faded into its head
  * peak-normalised to -3 dBFS, 44.1 kHz mono, Ogg Vorbis q4

Two loops of different lengths (7.6 s, 5.8 s) play together in game, so the repeat period is long.

    python3 tools/make_fire_loops.py <dir with fire_large.ogg fire_small.ogg> [out_dir]
"""
import subprocess, sys
import numpy as np
from scipy import signal
from scipy.ndimage import median_filter

SR = 44100
SRC = sys.argv[1]
OUT = (sys.argv[2] if len(sys.argv) > 2 else 'src/assets/audio').rstrip('/') + '/'


def load(p):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def lowpass(x, hz, order=2):
    sos = signal.butter(order, hz / (SR / 2), 'low', output='sos')
    return signal.sosfiltfilt(sos, x)


def highpass(x, hz, order=2):
    sos = signal.butter(order, hz / (SR / 2), 'high', output='sos')
    return signal.sosfiltfilt(sos, x)


def soft_limit_pops(x, ceiling_db=12.0, ratio=4.0):
    """Tame only the sharp pops: where the 3 ms envelope rises more than ceiling_db above the
    local crackle bed (median of the envelope over 0.6 s), compress the excess ratio:1."""
    w = int(0.003 * SR)
    fast = np.sqrt(np.convolve(x ** 2, np.ones(w) / w, 'same')) + 1e-9
    hop = int(0.01 * SR)
    coarse = fast[::hop]
    bed = median_filter(coarse, size=61, mode='wrap')            # 0.6 s
    bed = np.interp(np.arange(len(x)), np.arange(len(coarse)) * hop, bed) + 1e-9
    excess = 20 * np.log10(fast / bed) - ceiling_db
    gr_db = np.where(excess > 0, -excess * (1 - 1 / ratio), 0.0)
    gr = 10 ** (gr_db / 20)
    rel = np.exp(-1 / (0.04 * SR))                                # 40 ms release
    g = np.empty_like(gr)
    cur = 1.0
    for i, v in enumerate(gr):
        cur = v if v < cur else v + (cur - v) * rel
        g[i] = cur
    return x * g


def make_loop(x, fade_s):
    """Equal-power crossfade of the last fade_s seconds into the first: seamless when looped."""
    n = int(fade_s * SR)
    body = x[:-n].copy()
    t = np.linspace(0, np.pi / 2, n)
    body[:n] = x[:n] * np.sin(t) + x[-n:] * np.cos(t)
    return body


def write(name, x):
    x = x / np.abs(x).max() * 10 ** (-3 / 20)
    p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                        '-c:a', 'libvorbis', '-q:a', '4', OUT + name], input=x.astype(np.float32).tobytes(), check=True)
    print('wrote', OUT + name, f'{len(x) / SR:.2f}s')


bed = highpass(lowpass(load(SRC + '/fire_large.ogg'), 5500), 90)
write('fire_bed.ogg', make_loop(bed, 0.85))
crk = soft_limit_pops(highpass(lowpass(load(SRC + '/fire_small.ogg'), 6500), 70))
write('fire_crackle.ogg', make_loop(crk, 0.65))
