# Face unlock models

Read by `src/face_unlock/models.rs`, bundled through `bundle.resources` in
`tauri.conf.json`. The `.onnx` files are **not in git** (SFace alone is 38.7 MB);
`node scripts/fetch-face-models.js` downloads them here and checks each
SHA-256. Without them the app runs, and face unlock says it is unavailable.

| File                                  | From                                                                                                               | Licence    | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------ |
| `face_detection_yunet_2023mar.onnx`   | [opencv_zoo, face_detection_yunet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)     | MIT        | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` |
| `face_recognition_sface_2021dec.onnx` | [opencv_zoo, face_recognition_sface](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface) | Apache-2.0 | `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79` |

- YuNet runs at 320×256 (a frame scaled to fit, padded below); both sides must be
  multiples of 32. It has 640×640 written into its intermediate shapes, so tract
  loads it ignoring them (spike 0.5).
- SFace is the fp32 file: the int8 one uses `QLinearMul`, which tract does not
  implement.
- **No anti-spoofing model.** There is no official MiniFASNet ONNX, and none
  whose origin and licence were checked. Until one is, face unlock relies on
  the head-movement challenges alone (`docs/face-unlock-plan.md`, Phase 4).
- Licence texts go to `THIRD-PARTY-LICENSES.md` with Phase 6.
