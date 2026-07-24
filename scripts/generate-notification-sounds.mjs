import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 22_050;
const MAXIMUM_AMPLITUDE = 0.72;
const outputDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'assets',
  'sounds',
);

const clampSample = (sample) =>
  Math.max(-1, Math.min(1, sample * MAXIMUM_AMPLITUDE));

const fadeEnvelope = (time, duration, decay, attack = 0.008) => {
  const fadeIn = Math.min(time / attack, 1);
  const fadeOut = Math.min((duration - time) / 0.035, 1);
  return fadeIn * Math.max(fadeOut, 0) * Math.exp(-decay * time);
};

const sine = (frequency, time, phase = 0) =>
  Math.sin(2 * Math.PI * frequency * time + phase);

const writeWaveFile = async (fileName, duration, createSample) => {
  const sampleCount = Math.ceil(SAMPLE_RATE * duration);
  const dataLength = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataLength);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE;
    const sample = clampSample(createSample(time, duration));
    buffer.writeInt16LE(Math.round(sample * 32_767), 44 + index * 2);
  }

  await writeFile(join(outputDirectory, fileName), buffer);
};

await mkdir(outputDirectory, { recursive: true });

await Promise.all([
  writeWaveFile('soft-bell.wav', 0.95, (time, duration) => {
    const envelope = fadeEnvelope(time, duration, 3.4);
    return (
      envelope *
      (0.62 * sine(659.25, time) +
        0.24 * sine(987.77, time, 0.18) +
        0.1 * sine(1_318.5, time, 0.34))
    );
  }),
  writeWaveFile('digital-bell.wav', 0.62, (time, duration) => {
    const secondPulseTime = Math.max(time - 0.19, 0);
    const firstEnvelope = fadeEnvelope(time, duration, 5.3);
    const secondEnvelope =
      time < 0.19
        ? 0
        : fadeEnvelope(secondPulseTime, duration - 0.19, 6.1);
    return (
      firstEnvelope *
        (0.42 * sine(880, time) +
          0.14 * sine(1_760, time) +
          0.08 * sine(2_640, time)) +
      secondEnvelope *
        (0.38 * sine(1_174.66, secondPulseTime) +
          0.12 * sine(2_349.32, secondPulseTime))
    );
  }),
  writeWaveFile('zen-chime.wav', 1.18, (time, duration) => {
    const envelope = fadeEnvelope(time, duration, 2.75, 0.012);
    const shimmer = 0.5 + 0.5 * Math.sin(2 * Math.PI * 2.2 * time);
    return (
      envelope *
      (0.48 * sine(523.25, time) +
        0.23 * sine(783.99, time, 0.12) +
        0.1 * shimmer * sine(1_568, time, 0.3))
    );
  }),
  writeWaveFile('pop.wav', 0.28, (time, duration) => {
    const progress = time / duration;
    const frequency = 480 - 290 * progress;
    const envelope = fadeEnvelope(time, duration, 8.5, 0.004);
    return (
      envelope *
      (0.7 * sine(frequency, time) +
        0.13 * sine(frequency * 1.5, time, 0.2))
    );
  }),
]);
