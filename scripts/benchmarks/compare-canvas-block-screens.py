"""Validate native screenshots and assemble unscaled map-body crops (Pillow)."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path('output/canvas-block-2026-10-23')
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)
results = {'definition': 'Native window crops; pixel differences are not a quality score.',
           'crop': [62, 215, 962, 515], 'quality': [], 'usage': []}

for language in ('ja', 'en'):
    for floor in ('1F', '5F'):
        figure = Image.new('RGB', (1800, 676), '#f1f3f5')
        label = ImageDraw.Draw(figure)
        states = {}
        for col, variant in enumerate(('baseline', 'canvas')):
            for row, phase in enumerate(('moving', 'stopped')):
                stem = f'safari-quality-{variant}-{language}-{floor}-23-{phase}'
                data = json.loads((root / (stem + '.json')).read_text())
                assert not data['errors']
                assert data['environment']['iframe'] == [900, 440]
                assert data['environment']['dpr'] == 1
                state = data['state']
                if phase == 'stopped':
                    assert state['scale'] == 1
                if variant == 'canvas':
                    assert state['tiles']['ready'] and state['tiles']['blank'] == 0
                    assert not state['tiles']['errors']
                states[variant, phase] = state
                image = Image.open(root / (stem + '.png')).convert('RGB')
                assert image.width == 1024 and image.height in (603, 604, 605)
                crop = image.crop(tuple(results['crop']))
                label.text((col * 900 + 12, row * 338 + 7),
                           f'{language} {floor} | {variant} | {phase}', font=font, fill='#101820')
                figure.paste(crop, (col * 900, row * 338 + 38))
        widths = [s['logicalWidth'] for s in states.values()]
        assert max(widths) - min(widths) < .02
        target = f'quality-{language}-{floor}-comparison.png'
        figure.save(root / target)
        results['quality'].append({'language': language, 'floor': floor,
                                   'logicalWidthRange': [min(widths), max(widths)],
                                   'svgMovingScale': states['baseline', 'moving']['scale'],
                                   'canvasMovingScaleOnHiddenDom': states['canvas', 'moving']['scale'],
                                   'figure': target})

figure = Image.new('RGB', (1800, 676), '#f1f3f5')
label = ImageDraw.Draw(figure)
firefox_widths = []
for col, variant in enumerate(('baseline', 'canvas')):
    for row, phase in enumerate(('moving', 'stopped')):
        stem = f'firefox-quality-{variant}-ja-1F-23-{phase}'
        data = json.loads((root / (stem + '.json')).read_text())
        assert not data['errors'] and data['state']['scale'] == 1
        firefox_widths.append(data['state']['logicalWidth'])
        if variant == 'canvas':
            assert data['state']['tiles']['ready'] and data['state']['tiles']['blank'] == 0
        image = Image.open(root / (stem + '.png')).convert('RGB')
        assert image.size == (1024, 604)
        # Firefox's 37px side bar shifts the centered iframe to x=43.5.
        figure.paste(image.crop((44, 213, 944, 513)), (col * 900, row * 338 + 38))
        label.text((col * 900 + 12, row * 338 + 7),
                   f'Firefox ja 1F | {variant} | {phase}', font=font, fill='#101820')
assert max(firefox_widths) - min(firefox_widths) < .02
figure.save(root / 'quality-firefox-ja-1F-comparison.png')
results['firefoxSupplement'] = {'nativeScreenshots': 4, 'crop': [44, 213, 944, 513],
                               'logicalWidthRange': [min(firefox_widths), max(firefox_widths)],
                               'svgMovingScale': 1, 'allCanvasTilesReady': True}

for language, query in (('ja', 'AC130'), ('en', 'AS555')):
    values = {}
    for variant in ('baseline', 'canvas'):
        stem = f'safari-usage-{variant}-{language}-{query}'
        data = json.loads((root / (stem + '.json')).read_text())
        assert not data['errors'] and (root / (stem + '.png')).exists()
        values[variant] = data
    a, b = values['baseline'], values['canvas']
    assert a['search']['floor'] == b['search']['floor']
    assert a['search']['hash'] == b['search']['hash']
    delta = max(abs(a['search']['highlight'][k] - b['search']['highlight'][k])
                for k in ('x', 'y', 'width', 'height'))
    assert delta < .02
    assert len(a['rings']) == len(b['rings'])
    assert a['rings'] == b['rings']
    assert b['search']['state']['tiles']['ready']
    results['usage'].append({'language': language, 'query': query,
                             'floor': a['search']['floor'], 'rings': len(a['rings']),
                             'highlightMaxDeltaCssPx': delta, 'ringsGeometryEqual': True})

(root / 'visual-validation.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(results, ensure_ascii=False, indent=2))
