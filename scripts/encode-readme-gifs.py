"""Encode GIFs from actual headless UI capture frames; requires Pillow."""
from pathlib import Path
import json
import shutil
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / 'docs' / 'media'
WORK = ROOT / 'evidence' / 'readme-media-background'
shutil.copyfile(WORK / 'reference-02.png', MEDIA / 'formula-reference.png')
reports = []
for source, target in [('reference-frames.json', 'formula-reference.gif'), ('image-frames.json', 'page-images.gif')]:
    items = json.loads((WORK / source).read_text(encoding='utf-8'))
    frames, durations = [], []
    for item in items:
        frame_path = Path(item['file']).resolve()
        if frame_path.parent != WORK.resolve():
            raise ValueError('Frame must belong to the capture directory')
        with Image.open(frame_path) as image:
            frames.append(image.convert('RGB').quantize(colors=192, method=Image.Quantize.MEDIANCUT))
        durations.append(item['duration'])
    frames[0].save(MEDIA / target, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True, disposal=1)
    with Image.open(MEDIA / target) as image:
        if image.n_frames < 2 or image.size != (1440, 1000):
            raise ValueError('Invalid demonstration GIF')
        reports.append(dict(file=target, width=image.width, height=image.height, frames=image.n_frames, bytes=(MEDIA / target).stat().st_size, durationMs=sum(durations)))
(WORK / 'gif-report.json').write_text(json.dumps(reports, indent=2) + '\n', encoding='utf-8')
print(json.dumps(reports))
