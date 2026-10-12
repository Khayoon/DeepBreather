"""
Generate seamless ambient loops for Deep Breather.

Everything is built to be exactly periodic over LOOP_S seconds so the file
loops without a click: all oscillator/LFO frequencies are snapped to integer
multiples of 1/LOOP_S, and noise beds are synthesised in the frequency domain
(an inverse FFT of a shaped spectrum is circularly continuous by construction).
"""
import numpy as np
import soundfile as sf
import os

SR = 44100
LOOP_S = 48.0
N = int(SR * LOOP_S)
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "audio")
os.makedirs(OUT, exist_ok=True)

t = np.arange(N) / SR
BASE = 1.0 / LOOP_S  # fundamental of the loop, ~0.02083 Hz

rng = np.random.default_rng(7)


def snap(freq):
    """Snap a frequency to the nearest integer multiple of the loop fundamental."""
    return max(1, round(freq / BASE)) * BASE


def osc(freq, phase=0.0):
    return np.sin(2 * np.pi * snap(freq) * t + phase)


def lfo(freq, lo=0.0, hi=1.0, phase=0.0):
    return lo + (hi - lo) * (0.5 + 0.5 * np.sin(2 * np.pi * snap(freq) * t + phase))


def shaped_noise(centre, width, seed, tilt=0.0):
    """Band-shaped noise, periodic over the loop (built via inverse FFT)."""
    r = np.random.default_rng(seed)
    n_bins = N // 2 + 1
    freqs = np.fft.rfftfreq(N, 1 / SR)
    mag = np.exp(-0.5 * ((np.log2(np.maximum(freqs, 1e-6) / centre)) / width) ** 2)
    with np.errstate(divide="ignore"):
        mag *= np.power(np.maximum(freqs, 1e-6), tilt)
    mag[0] = 0.0
    phase = r.uniform(0, 2 * np.pi, n_bins)
    spec = mag * np.exp(1j * phase)
    sig = np.fft.irfft(spec, N)
    return sig / (np.max(np.abs(sig)) + 1e-12)


def normalise(x, peak=0.72):
    x = x - np.mean(x)
    return x * (peak / (np.max(np.abs(x)) + 1e-12))


def edge_trough(seconds=2.5, floor=0.22):
    """
    Dip the loop boundary into a quiet trough.

    MP3 carries encoder/decoder padding, so a looped file gets a few tens of
    milliseconds of silence at the seam no matter how periodic the source is.
    Landing that seam in a quiet swell makes it inaudible, and on these slow
    pads it reads as an intentional breath rather than a gap.
    """
    ramp_n = int(seconds * SR)
    env = np.ones(N)
    ramp = floor + (1 - floor) * (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, ramp_n)))
    env[:ramp_n] = ramp
    env[-ramp_n:] = ramp[::-1]
    return env


def stereo(left, right):
    env = edge_trough()
    return np.stack([normalise(left) * env, normalise(right) * env], axis=1)


def write(name, data):
    wav = os.path.join(OUT, name + ".wav")
    mp3 = os.path.join(OUT, name + ".mp3")
    sf.write(wav, data, SR, subtype="PCM_16")
    os.system(
        f'ffmpeg -y -loglevel error -i "{wav}" -codec:a libmp3lame '
        f'-b:a 80k -joint_stereo 1 "{mp3}"'
    )
    os.remove(wav)
    print(name, os.path.getsize(mp3) // 1024, "KB")


# --- 1. Calm Drift -----------------------------------------------------------
# Warm major-ninth pad on a low A, partials fading in and out against each other.
def calm_drift():
    root = 55.0  # A1
    partials = [
        (root, 1.00, 1 / 24),
        (root * 2, 0.55, 1 / 32),
        (root * 3, 0.22, 1 / 19),
        (root * 4, 0.16, 1 / 27),
        (root * 4.5, 0.11, 1 / 37),  # ninth
        (root * 6, 0.09, 1 / 21),
        (root * 9, 0.05, 1 / 29),
    ]
    left = np.zeros(N)
    right = np.zeros(N)
    for i, (f, amp, rate) in enumerate(partials):
        env_l = lfo(rate, 0.25, 1.0, phase=i * 0.9)
        env_r = lfo(rate, 0.25, 1.0, phase=i * 0.9 + 0.6)
        # slight detune between channels widens the pad
        left += amp * env_l * osc(f, phase=i * 1.7)
        right += amp * env_r * osc(f * 1.003, phase=i * 1.7 + 0.4)
    air = shaped_noise(2200, 1.3, seed=11) * lfo(1 / 40, 0.02, 0.07)
    left += air
    right += shaped_noise(2200, 1.3, seed=12) * lfo(1 / 40, 0.02, 0.07, phase=1.1)
    swell = lfo(1 / 48, 0.62, 1.0)
    return stereo(left * swell, right * swell)


# --- 2. Deep Space -----------------------------------------------------------
# Sub-bass bed with a slow rumble and distant filtered noise swells.
def deep_space():
    sub = 0.9 * osc(36.0) + 0.35 * osc(54.0, phase=1.2) + 0.18 * osc(72.0, phase=2.4)
    sub *= lfo(1 / 32, 0.55, 1.0)
    lowbed_l = shaped_noise(160, 1.1, seed=21) * lfo(1 / 24, 0.15, 0.55)
    lowbed_r = shaped_noise(160, 1.1, seed=22) * lfo(1 / 24, 0.15, 0.55, phase=1.4)
    shimmer_l = shaped_noise(900, 1.6, seed=23) * lfo(1 / 16, 0.0, 0.10, phase=0.3)
    shimmer_r = shaped_noise(900, 1.6, seed=24) * lfo(1 / 16, 0.0, 0.10, phase=1.9)
    left = 0.85 * sub + 0.7 * lowbed_l + shimmer_l
    right = 0.85 * sub + 0.7 * lowbed_r + shimmer_r
    return stereo(left, right)


# --- 3. Slow Flow ------------------------------------------------------------
# Breath-paced wash: pink-ish noise rising and falling like distant surf.
def slow_flow():
    def channel(seed, phase):
        wash = shaped_noise(500, 2.2, seed=seed, tilt=-0.55)
        # two overlapping surf envelopes, both periodic over the loop
        env = lfo(1 / 12, 0.18, 1.0, phase=phase) * lfo(1 / 48, 0.5, 1.0, phase=phase)
        body = 0.16 * osc(110.0, phase=phase) + 0.10 * osc(165.0, phase=phase + 0.8)
        return wash * env + body * lfo(1 / 24, 0.3, 0.9, phase=phase)

    return stereo(channel(31, 0.0), channel(32, 0.7))


# --- 4. Ember ----------------------------------------------------------------
# Singing-bowl style: a struck-bowl partial set with slow, breath-length pulses.
def ember():
    root = 130.81  # C3
    ratios = [1.0, 2.0, 2.76, 4.07, 5.43, 8.0]
    amps = [1.0, 0.5, 0.28, 0.16, 0.09, 0.05]
    left = np.zeros(N)
    right = np.zeros(N)
    # six evenly spaced strikes across the loop => still periodic
    strikes = 6
    period = N // strikes
    offset = period // 2  # keep a strike off the loop seam
    decay = np.exp(-np.arange(period) / (SR * 3.2))
    for s in range(strikes):
        start = (s * period + offset) % N
        if start + period > N:
            continue
        for i, (r, a) in enumerate(zip(ratios, amps)):
            f = snap(root * r)
            seg = a * decay * np.sin(2 * np.pi * f * (np.arange(period) / SR) + i)
            left[start:start + period] += seg * (0.9 if s % 2 == 0 else 0.6)
            right[start:start + period] += seg * (0.6 if s % 2 == 0 else 0.9)
    pad = 0.30 * osc(root / 2) * lfo(1 / 24, 0.4, 1.0)
    left = 0.55 * left + pad
    right = 0.55 * right + pad
    return stereo(left, right)


if __name__ == "__main__":
    write("calm-drift", calm_drift())
    write("deep-space", deep_space())
    write("slow-flow", slow_flow())
    write("ember", ember())
