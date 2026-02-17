let audioContext: AudioContext | null = null;
let fireSound: AudioBufferSourceNode | null = null;
let gainNode: GainNode | null = null;
let isPlaying = false;

export function initAudio(): void {
  // Audio will be initialized on user interaction
  document.addEventListener('click', startAudioContext, { once: true });
  document.addEventListener('keydown', startAudioContext, { once: true });
}

async function startAudioContext(): Promise<void> {
  if (audioContext) return;

  try {
    audioContext = new AudioContext();
    gainNode = audioContext.createGain();
    gainNode.gain.value = 0.3;
    gainNode.connect(audioContext.destination);

    // Try to load audio file
    await loadFireSound();
  } catch (error) {
    console.warn('Audio initialization failed:', error);
    // Fallback: Create synthetic fire crackle sound
    createSyntheticFireSound();
  }
}

async function loadFireSound(): Promise<void> {
  if (!audioContext || !gainNode) return;

  try {
    const response = await fetch('/assets/audio/fire_crackle.mp3');
    if (!response.ok) throw new Error('Audio file not found');

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    fireSound = audioContext.createBufferSource();
    fireSound.buffer = audioBuffer;
    fireSound.loop = true;
    fireSound.connect(gainNode);
    fireSound.start();
    isPlaying = true;
  } catch (error) {
    console.warn('Could not load fire sound, using synthetic:', error);
    createSyntheticFireSound();
  }
}

function createSyntheticFireSound(): void {
  if (!audioContext || !gainNode) return;

  // Create brown noise (fire-like)
  const bufferSize = 2 * audioContext.sampleRate;
  const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const output = noiseBuffer.getChannelData(0);

  let lastOut = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    output[i] = (lastOut + (0.02 * white)) / 1.02;
    lastOut = output[i];
    output[i] *= 3.5;
  }

  const whiteNoise = audioContext.createBufferSource();
  whiteNoise.buffer = noiseBuffer;
  whiteNoise.loop = true;

  // Filter for fire crackle effect
  const filter = audioContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;

  const filter2 = audioContext.createBiquadFilter();
  filter2.type = 'highpass';
  filter2.frequency.value = 80;

  // LFO for subtle variation
  const lfo = audioContext.createOscillator();
  const lfoGain = audioContext.createGain();
  lfo.frequency.value = 0.5;
  lfoGain.gain.value = 100;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  whiteNoise.connect(filter);
  filter.connect(filter2);
  filter2.connect(gainNode);
  whiteNoise.start();

  isPlaying = true;
}

export function playFireSound(): void {
  // Sound starts automatically after user interaction
}

export function setVolume(value: number): void {
  if (gainNode) {
    gainNode.gain.value = Math.max(0, Math.min(1, value));
  }
}
