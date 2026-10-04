#!/usr/bin/env node
/**
 * Fetches the face unlock models into src-tauri/models/ and checks each
 * SHA-256 before keeping it.
 *
 * The models are not in git — SFace alone is 38.7 MB — so a fresh checkout
 * runs this once. Without them Uni Pilot builds and runs, and face unlock says
 * it is unavailable. Files already here with the right checksum are left as
 * they are; nothing else is downloaded.
 *
 *   node scripts/fetch-face-models.js
 *
 * Sources and licences: src-tauri/models/README.md.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODELS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'models');
const ZOO = 'https://github.com/opencv/opencv_zoo/raw/main/models';

const FILES = [
  {
    name: 'face_detection_yunet_2023mar.onnx',
    url: `${ZOO}/face_detection_yunet/face_detection_yunet_2023mar.onnx`,
    sha256: '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
  },
  {
    name: 'face_recognition_sface_2021dec.onnx',
    url: `${ZOO}/face_recognition_sface/face_recognition_sface_2021dec.onnx`,
    sha256: '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',
  },
];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

await mkdir(MODELS, { recursive: true });
for (const file of FILES) {
  const path = join(MODELS, file.name);
  if (existsSync(path) && sha256(await readFile(path)) === file.sha256) {
    console.log(`${file.name}: here already.`);
    continue;
  }
  process.stdout.write(`${file.name}: downloading… `);
  const response = await fetch(file.url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`${file.url} answered ${response.status}.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const found = sha256(bytes);
  if (found !== file.sha256) {
    throw new Error(`${file.name} has SHA-256 ${found}, not ${file.sha256}. Not kept.`);
  }
  await writeFile(path, bytes);
  console.log(`${(bytes.length / 1e6).toFixed(1)} MB, checksum good.`);
}
