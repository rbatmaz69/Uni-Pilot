import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openCamera } from './camera';

const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
const getUserMedia = vi.fn();
const drawImage = vi.fn();
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

beforeEach(() => {
  for (const track of tracks) track.stop.mockReset();
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => tracks });
  drawImage.mockReset();
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done, type, quality) => {
    expect([type, quality]).toEqual(['image/jpeg', 0.85]);
    done({ arrayBuffer: () => Promise.resolve(JPEG.buffer) } as Blob);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the camera', () => {
  it('asks for the front camera at 640×480, without sound', async () => {
    await openCamera(document.createElement('video'));
    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
  });

  it('gives frames as JPEG, unmirrored', async () => {
    const video = document.createElement('video');
    const camera = await openCamera(video);
    expect(await camera.grab()).toEqual(JPEG);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480);
  });

  it('turns every track off, and gives no frame after', async () => {
    const video = document.createElement('video');
    const camera = await openCamera(video);
    camera.stop();
    camera.stop();
    for (const track of tracks) expect(track.stop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
    await expect(camera.grab()).rejects.toThrow('The camera is off.');
  });

  it('turns the camera off again when the picture does not start', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('no picture'));
    await expect(openCamera(document.createElement('video'))).rejects.toThrow('no picture');
    for (const track of tracks) expect(track.stop).toHaveBeenCalledOnce();
  });
});
